import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import { CustomerEntity } from '../../../src/database/entities/customer.entity.js';
import { FaucetRequestEntity } from '../../../src/database/entities/faucet-request.entity.js';
import { StudioMigrations1791500000000 } from '../../../src/database/migrations/1791500000000-studio-migrations.js';
import { StudioMigrations1791500000001 } from '../../../src/database/migrations/1791500000001-studio-migrations.js';
import { StudioMigrations1791500000002 } from '../../../src/database/migrations/1791500000002-studio-migrations.js';
import type { FaucetRequestService } from '../../../src/services/api/faucet-request.js';

/**
 * Integration test for the monthly faucet quota ledger. It needs a real Postgres (the concurrency guarantee
 * relies on an advisory lock) and is skipped unless FAUCET_TEST_DATABASE_URL is set. The database is treated as
 * disposable: the `customer` and `faucetRequest` tables are created and the latter is dropped and recreated.
 *
 *   docker run -d --rm --name faucet-test-db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=studio -p 55432:5432 postgres:16
 *   FAUCET_TEST_DATABASE_URL=postgres://postgres:pw@localhost:55432/studio npm run test:unit -- faucet-request.service
 */
const databaseUrl = process.env.FAUCET_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const cheq = (amount: number) => BigInt(amount) * 1_000_000_000n;
const LIMIT = cheq(100_000);

describeWithDatabase('FaucetRequestService (Postgres)', () => {
	let dataSource: DataSource;
	let service: FaucetRequestService;
	let uniqueCounter = 0;

	const newCustomer = async (): Promise<CustomerEntity> =>
		dataSource
			.getRepository(CustomerEntity)
			.save(
				new CustomerEntity(
					undefined as unknown as string,
					'Test',
					`faucet-${Date.now()}-${uniqueCounter++}@example.com`
				)
			);

	beforeAll(async () => {
		const bootstrap = new DataSource({
			type: 'postgres',
			url: databaseUrl,
			entities: [CustomerEntity],
			synchronize: true,
		});
		await bootstrap.initialize();
		await bootstrap.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
		await bootstrap.query('DROP TABLE IF EXISTS "faucetRequest"');
		await bootstrap.destroy();

		dataSource = new DataSource({
			type: 'postgres',
			url: databaseUrl,
			entities: [CustomerEntity, FaucetRequestEntity],
		});
		await dataSource.initialize();
		await new StudioMigrations1791500000000().up(dataSource.createQueryRunner());
		await new StudioMigrations1791500000001().up(dataSource.createQueryRunner());
		await new StudioMigrations1791500000002().up(dataSource.createQueryRunner());
		// Imported here, not at the top: the service pulls in the database connection, whose entities require
		// ENABLE_EXTERNAL_DB to be defined at import time, and a skipped run should not load any of that.
		process.env.ENABLE_EXTERNAL_DB ??= 'false';
		const { FaucetRequestService: Service } = await import('../../../src/services/api/faucet-request.js');
		service = new Service(dataSource.getRepository(FaucetRequestEntity));
	}, 60_000);

	afterAll(async () => {
		await dataSource?.destroy();
	});

	it('creates a table that matches the entity (no schema drift)', async () => {
		const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
		expect(upQueries.map((q) => q.query).filter((q) => q.includes('faucetRequest'))).toEqual([]);
	});

	it('exposes amounts as bigint and lets the database set createdAt', async () => {
		const customer = await newCustomer();
		const reservation = await service.reserve(customer, 'cheqd1a', cheq(12_345), { limitNcheq: LIMIT });
		if (!reservation.reserved) throw new Error('expected a reservation');

		const row = await dataSource
			.getRepository(FaucetRequestEntity)
			.findOneByOrFail({ faucetRequestId: reservation.faucetRequestId });

		expect(row.amountNcheq).toBe(cheq(12_345));
		expect(typeof row.amountNcheq).toBe('bigint');
		expect(row.createdAt).toBeInstanceOf(Date);
		const [{ drift }] = await dataSource.query(
			`SELECT abs(extract(epoch from (now() - "createdAt"))) AS drift FROM "faucetRequest" WHERE "faucetRequestId" = $1`,
			[reservation.faucetRequestId]
		);
		expect(Number(drift)).toBeLessThan(5);
	});

	it('starts at zero and counts what has been reserved', async () => {
		const customer = await newCustomer();
		expect(await service.getUsedNcheq(customer)).toBe(0n);

		const first = await service.reserve(customer, 'cheqd1a', cheq(10_000), { limitNcheq: LIMIT });
		const second = await service.reserve(customer, 'cheqd1a', cheq(5_000), { limitNcheq: LIMIT });

		expect(first).toMatchObject({ reserved: true, usedNcheq: 0n });
		expect(second).toMatchObject({ reserved: true, usedNcheq: cheq(10_000) });
		expect(await service.getUsedNcheq(customer)).toBe(cheq(15_000));
	});

	it('rejects a reservation that would exceed the limit and leaves usage unchanged', async () => {
		const customer = await newCustomer();
		await service.reserve(customer, 'cheqd1a', cheq(95_000), { limitNcheq: LIMIT });

		const result = await service.reserve(customer, 'cheqd1a', cheq(5_001), { limitNcheq: LIMIT });

		expect(result).toMatchObject({ reserved: false, usedNcheq: cheq(95_000) });
		expect(await service.getUsedNcheq(customer)).toBe(cheq(95_000));
	});

	it('accepts a reservation that exactly reaches the limit', async () => {
		const customer = await newCustomer();
		await service.reserve(customer, 'cheqd1a', cheq(95_000), { limitNcheq: LIMIT });
		expect(await service.reserve(customer, 'cheqd1a', cheq(5_000), { limitNcheq: LIMIT })).toMatchObject({
			reserved: true,
		});
	});

	it('gives quota back when a reservation is released', async () => {
		const customer = await newCustomer();
		const reservation = await service.reserve(customer, 'cheqd1a', cheq(60_000), { limitNcheq: LIMIT });
		if (!reservation.reserved) throw new Error('expected a reservation');

		await service.release(reservation.faucetRequestId);

		expect(await service.getUsedNcheq(customer)).toBe(0n);
		expect(await service.reserve(customer, 'cheqd1a', cheq(100_000), { limitNcheq: LIMIT })).toMatchObject({
			reserved: true,
		});
	});

	it('keeps customers independent', async () => {
		const a = await newCustomer();
		const b = await newCustomer();
		await service.reserve(a, 'cheqd1a', cheq(100_000), { limitNcheq: LIMIT });

		expect(await service.getUsedNcheq(b)).toBe(0n);
		expect(await service.reserve(b, 'cheqd1b', cheq(1), { limitNcheq: LIMIT })).toMatchObject({ reserved: true });
	});

	it('only counts requests made in the current calendar month (UTC)', async () => {
		const customer = await newCustomer();
		const old = await service.reserve(
			customer,
			'cheqd1a',
			cheq(90_000),
			{ limitNcheq: LIMIT },
			new Date('2026-09-15T12:00:00Z')
		);
		if (!old.reserved) throw new Error('expected a reservation');
		// Back-date the row, as the entity sets createdAt itself on insert
		await dataSource.query(`UPDATE "faucetRequest" SET "createdAt" = $1 WHERE "faucetRequestId" = $2`, [
			'2026-09-15T12:00:00Z',
			old.faucetRequestId,
		]);

		const now = new Date('2026-10-08T12:00:00Z');
		expect(await service.getUsedNcheq(customer, now)).toBe(0n);
		expect(await service.reserve(customer, 'cheqd1a', cheq(100_000), { limitNcheq: LIMIT }, now)).toMatchObject({
			reserved: true,
		});
	});

	it('rejects a request made too soon after the previous one, and allows it afterwards', async () => {
		const customer = await newCustomer();
		const options = { limitNcheq: LIMIT, minIntervalSeconds: 60 };
		expect(await service.getSecondsUntilNextAllowed(customer, 60)).toBe(0);
		await service.reserve(customer, 'cheqd1a', cheq(1), options);

		const wait = await service.getSecondsUntilNextAllowed(customer, 60);
		expect(wait).toBeGreaterThan(0);
		expect(wait).toBeLessThanOrEqual(60);
		expect(await service.reserve(customer, 'cheqd1a', cheq(1), options)).toMatchObject({
			reserved: false,
			reason: 'too_frequent',
		});
		expect(await service.getUsedNcheq(customer)).toBe(cheq(1));

		// once the interval has passed (as seen from a later clock) the next request is allowed
		const later = new Date(Date.now() + 61_000);
		expect(await service.getSecondsUntilNextAllowed(customer, 60, later)).toBe(0);
		expect(await service.reserve(customer, 'cheqd1a', cheq(1), options, later)).toMatchObject({ reserved: true });
	});

	it('lets only one of several simultaneous requests through when an interval is set', async () => {
		const customer = await newCustomer();
		const options = { limitNcheq: LIMIT, minIntervalSeconds: 60 };

		const results = await Promise.all(
			Array.from({ length: 5 }, () => service.reserve(customer, 'cheqd1a', cheq(1), options))
		);

		expect(results.filter((r) => r.reserved)).toHaveLength(1);
		expect(results.filter((r) => !r.reserved && r.reason === 'too_frequent')).toHaveLength(4);
	});

	describe('reservation status', () => {
		const statusOf = async (id: string) =>
			(
				await dataSource.query(
					`SELECT status, "completedAt" FROM "faucetRequest" WHERE "faucetRequestId" = $1`,
					[id]
				)
			)[0];
		const backdate = (id: string, minutesAgo: number) =>
			dataSource.query(
				`UPDATE "faucetRequest" SET "createdAt" = now() - ($1 || ' minutes')::interval WHERE "faucetRequestId" = $2`,
				[String(minutesAgo), id]
			);
		const reserveOne = async (customer: CustomerEntity, amount: number) => {
			const result = await service.reserve(customer, 'cheqd1a', cheq(amount), { limitNcheq: LIMIT });
			if (!result.reserved) throw new Error('expected a reservation');
			return result.faucetRequestId;
		};

		it('records a new reservation as pending and counts it', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 10_000);
			expect((await statusOf(id)).status).toBe('pending');
			expect(await service.getUsedNcheq(customer)).toBe(cheq(10_000));
		});

		it('marks a reservation completed with a completion time', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 10_000);
			await service.complete(id);
			const row = await statusOf(id);
			expect(row.status).toBe('completed');
			expect(row.completedAt).not.toBeNull();
			expect(await service.getUsedNcheq(customer)).toBe(cheq(10_000));
		});

		it('stops counting a pending reservation once it is older than the timeout, and marks it abandoned on the next reserve', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 90_000);
			await backdate(id, 11); // default timeout is 10 minutes

			expect(await service.getUsedNcheq(customer)).toBe(0n);
			expect((await statusOf(id)).status).toBe('pending'); // reads do not write

			expect(await service.reserve(customer, 'cheqd1a', cheq(100_000), { limitNcheq: LIMIT })).toMatchObject({
				reserved: true,
			});
			expect((await statusOf(id)).status).toBe('abandoned');
		});

		it('keeps counting a pending reservation that is still within the timeout', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 90_000);
			await backdate(id, 5);
			expect(await service.getUsedNcheq(customer)).toBe(cheq(90_000));
		});

		it('keeps counting an unknown reservation however old it is', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 90_000);
			await service.markUnknown(id);
			await backdate(id, 60 * 24);
			expect(await service.getUsedNcheq(customer)).toBe(cheq(90_000));
			expect(await service.reserve(customer, 'cheqd1a', cheq(10_001), { limitNcheq: LIMIT })).toMatchObject({
				reserved: false,
				reason: 'quota_exceeded',
			});
		});

		it('counts an abandoned reservation again if the faucet confirms it late', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 40_000);
			await backdate(id, 30);
			await service.reserve(customer, 'cheqd1a', cheq(1), { limitNcheq: LIMIT }); // sweeps it to abandoned
			expect((await statusOf(id)).status).toBe('abandoned');
			expect(await service.getUsedNcheq(customer)).toBe(cheq(1));

			await service.complete(id);
			expect(await service.getUsedNcheq(customer)).toBe(cheq(40_001));
		});

		it('does not let an abandoned reservation block the minimum interval', async () => {
			const customer = await newCustomer();
			const id = await reserveOne(customer, 1);
			await dataSource.query(
				`UPDATE "faucetRequest" SET status = 'abandoned', "createdAt" = now() - interval '1 second' WHERE "faucetRequestId" = $1`,
				[id]
			);
			expect(await service.getSecondsUntilNextAllowed(customer, 60)).toBe(0);
		});
	});

	describe('address cap', () => {
		// A monthly limit well above the address cap, so the cap is the limit that binds
		const HIGH_LIMIT = cheq(1_000_000);
		const capOptions = (balance: number, settleSeconds = 20) => ({
			limitNcheq: HIGH_LIMIT,
			addressCap: { capNcheq: cheq(100_000), currentBalanceNcheq: cheq(balance), settleSeconds },
		});

		it('accepts a request that fits under the cap and rejects one that does not', async () => {
			const customer = await newCustomer();
			expect(await service.reserve(customer, 'cheqd1a', cheq(40_000), capOptions(60_000))).toMatchObject({
				reserved: true,
			});

			const second = await service.reserve(customer, 'cheqd1b', cheq(40_001), capOptions(60_000));
			expect(second).toMatchObject({ reserved: false, reason: 'address_cap_exceeded', roomNcheq: cheq(40_000) });
		});

		it('counts requests still in flight for the same address, so simultaneous requests cannot overshoot', async () => {
			const customer = await newCustomer();

			const results = await Promise.all(
				Array.from({ length: 4 }, () => service.reserve(customer, 'cheqd1a', cheq(30_000), capOptions(60_000)))
			);

			// 60,000 held + 40,000 of room: only one 30,000 request fits
			expect(results.filter((r) => r.reserved)).toHaveLength(1);
			expect(results.filter((r) => !r.reserved && r.reason === 'address_cap_exceeded')).toHaveLength(3);
		});

		it('stops subtracting a request once it is older than the settle window', async () => {
			const customer = await newCustomer();
			const first = await service.reserve(customer, 'cheqd1a', cheq(30_000), capOptions(60_000));
			if (!first.reserved) throw new Error('expected a reservation');
			expect(await service.reserve(customer, 'cheqd1a', cheq(30_000), capOptions(60_000))).toMatchObject({
				reserved: false,
			});

			await dataSource.query(
				`UPDATE "faucetRequest" SET "createdAt" = now() - interval '1 minute' WHERE "faucetRequestId" = $1`,
				[first.faucetRequestId]
			);

			expect(await service.reserve(customer, 'cheqd1a', cheq(30_000), capOptions(60_000))).toMatchObject({
				reserved: true,
			});
		});

		it('does not count requests for other addresses or abandoned reservations', async () => {
			const customer = await newCustomer();
			const other = await service.reserve(customer, 'cheqd1other', cheq(40_000), capOptions(60_000));
			if (!other.reserved) throw new Error('expected a reservation');
			expect(await service.reserve(customer, 'cheqd1a', cheq(40_000), capOptions(60_000))).toMatchObject({
				reserved: true,
			});

			const stale = await newCustomer();
			const abandoned = await service.reserve(stale, 'cheqd1a', cheq(40_000), capOptions(60_000));
			if (!abandoned.reserved) throw new Error('expected a reservation');
			await dataSource.query(`UPDATE "faucetRequest" SET status = 'abandoned' WHERE "faucetRequestId" = $1`, [
				abandoned.faucetRequestId,
			]);
			expect(await service.reserve(stale, 'cheqd1a', cheq(40_000), capOptions(60_000))).toMatchObject({
				reserved: true,
			});
		});

		it('is not applied when no address cap is given', async () => {
			const customer = await newCustomer();
			expect(await service.reserve(customer, 'cheqd1a', cheq(500_000), { limitNcheq: HIGH_LIMIT })).toMatchObject(
				{ reserved: true }
			);
		});
	});

	it('never lets concurrent reservations exceed the limit', async () => {
		const customer = await newCustomer();

		const results = await Promise.all(
			Array.from({ length: 20 }, () => service.reserve(customer, 'cheqd1a', cheq(10_000), { limitNcheq: LIMIT }))
		);

		expect(results.filter((r) => r.reserved)).toHaveLength(10);
		expect(await service.getUsedNcheq(customer)).toBe(cheq(100_000));
	}, 30_000);
});
