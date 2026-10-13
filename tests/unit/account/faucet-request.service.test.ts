import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import { CustomerEntity } from '../../../src/database/entities/customer.entity.js';
import { FaucetRequestEntity } from '../../../src/database/entities/faucet-request.entity.js';
import { StudioMigrations1791500000000 } from '../../../src/database/migrations/1791500000000-studio-migrations.js';
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

	it('starts at zero and counts what has been reserved', async () => {
		const customer = await newCustomer();
		expect(await service.getUsedNcheq(customer)).toBe(0n);

		const first = await service.reserve(customer, 'cheqd1a', cheq(10_000), LIMIT);
		const second = await service.reserve(customer, 'cheqd1a', cheq(5_000), LIMIT);

		expect(first).toMatchObject({ reserved: true, usedNcheq: 0n });
		expect(second).toMatchObject({ reserved: true, usedNcheq: cheq(10_000) });
		expect(await service.getUsedNcheq(customer)).toBe(cheq(15_000));
	});

	it('rejects a reservation that would exceed the limit and leaves usage unchanged', async () => {
		const customer = await newCustomer();
		await service.reserve(customer, 'cheqd1a', cheq(95_000), LIMIT);

		const result = await service.reserve(customer, 'cheqd1a', cheq(5_001), LIMIT);

		expect(result).toMatchObject({ reserved: false, usedNcheq: cheq(95_000) });
		expect(await service.getUsedNcheq(customer)).toBe(cheq(95_000));
	});

	it('accepts a reservation that exactly reaches the limit', async () => {
		const customer = await newCustomer();
		await service.reserve(customer, 'cheqd1a', cheq(95_000), LIMIT);
		expect(await service.reserve(customer, 'cheqd1a', cheq(5_000), LIMIT)).toMatchObject({ reserved: true });
	});

	it('gives quota back when a reservation is released', async () => {
		const customer = await newCustomer();
		const reservation = await service.reserve(customer, 'cheqd1a', cheq(60_000), LIMIT);
		if (!reservation.reserved) throw new Error('expected a reservation');

		await service.release(reservation.faucetRequestId);

		expect(await service.getUsedNcheq(customer)).toBe(0n);
		expect(await service.reserve(customer, 'cheqd1a', cheq(100_000), LIMIT)).toMatchObject({ reserved: true });
	});

	it('keeps customers independent', async () => {
		const a = await newCustomer();
		const b = await newCustomer();
		await service.reserve(a, 'cheqd1a', cheq(100_000), LIMIT);

		expect(await service.getUsedNcheq(b)).toBe(0n);
		expect(await service.reserve(b, 'cheqd1b', cheq(1), LIMIT)).toMatchObject({ reserved: true });
	});

	it('only counts requests made in the current calendar month (UTC)', async () => {
		const customer = await newCustomer();
		const old = await service.reserve(customer, 'cheqd1a', cheq(90_000), LIMIT, new Date('2026-09-15T12:00:00Z'));
		if (!old.reserved) throw new Error('expected a reservation');
		// Back-date the row, as the entity sets createdAt itself on insert
		await dataSource.query(`UPDATE "faucetRequest" SET "createdAt" = $1 WHERE "faucetRequestId" = $2`, [
			'2026-09-15T12:00:00Z',
			old.faucetRequestId,
		]);

		const now = new Date('2026-10-08T12:00:00Z');
		expect(await service.getUsedNcheq(customer, now)).toBe(0n);
		expect(await service.reserve(customer, 'cheqd1a', cheq(100_000), LIMIT, now)).toMatchObject({
			reserved: true,
		});
	});

	it('never lets concurrent reservations exceed the limit', async () => {
		const customer = await newCustomer();

		const results = await Promise.all(
			Array.from({ length: 20 }, () => service.reserve(customer, 'cheqd1a', cheq(10_000), LIMIT))
		);

		expect(results.filter((r) => r.reserved)).toHaveLength(10);
		expect(await service.getUsedNcheq(customer)).toBe(cheq(100_000));
	}, 30_000);
});
