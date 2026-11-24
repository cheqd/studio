import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DataSource } from 'typeorm';
import { withPayerLock } from '../../../../src/services/identity/ledger-lock.js';
import { createPayerLockSource } from '../../../../src/services/identity/payer-lock-pool.js';

/**
 * Concurrency tests against a REAL Postgres. They run only when LEDGER_LOCK_TEST_DATABASE_URL is set, for example:
 *
 *   docker run --rm -d --name lock-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
 *   LEDGER_LOCK_TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npx jest ledger-lock-postgres
 *
 * Without it the suite is skipped, so normal CI is unaffected.
 */
const url = process.env.LEDGER_LOCK_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const MAIN_POOL = 3;
const LOCK_POOL = 2;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

suite('withPayerLock on a real Postgres with small pools', () => {
	jest.setTimeout(60_000);
	let main: DataSource;
	let lockSource: ReturnType<typeof createPayerLockSource>;

	beforeAll(async () => {
		main = new DataSource({
			type: 'postgres',
			url,
			entities: [],
			extra: { max: MAIN_POOL, connectionTimeoutMillis: 10_000 },
		});
		await main.initialize();
		lockSource = createPayerLockSource(main, {
			max: LOCK_POOL,
			idleTimeoutMillis: 5000,
			connectionTimeoutMillis: 200,
		});
	});

	afterAll(async () => {
		await lockSource?.destroy();
		await main?.destroy();
	});

	// What a ledger write does while it holds the lock: several queries on the MAIN pool, as `resolvePayer` does
	const writeUsingMainPool = async (hold: number) => {
		await main.query('SELECT 1');
		await main.query('SELECT 2');
		await main.query('SELECT 3');
		await sleep(hold);
	};

	it('does not exhaust the pools when many payers write at once', async () => {
		const payers = Array.from({ length: 12 }, (_, i) => `cheqd1payer${i}`);
		let holding = 0;
		let peak = 0;
		const started = Date.now();

		// A probe on the main pool, while the writes are in flight, must stay responsive
		const probes: number[] = [];
		const probing = (async () => {
			while (probes.length < 8) {
				const t = Date.now();
				await main.query('SELECT 1');
				probes.push(Date.now() - t);
				await sleep(100);
			}
		})();

		await Promise.all(
			payers.map((payer) =>
				withPayerLock(
					lockSource,
					payer,
					async () => {
						holding++;
						peak = Math.max(peak, holding);
						await writeUsingMainPool(150);
						holding--;
					},
					{ lockTimeoutMs: 30_000, retryInitialMs: 10, retryMaxMs: 50 }
				)
			)
		);
		await probing;

		// Lock connections are capped by the lock pool, not by the main pool, and every write finished
		expect(peak).toBeLessThanOrEqual(LOCK_POOL);
		expect(peak).toBeGreaterThan(1);
		expect(holding).toBe(0);
		expect(Math.max(...probes)).toBeLessThan(2000);
		expect(Date.now() - started).toBeLessThan(30_000);
	});

	it('contrast: locks taken from the main pool stall the same workload (the failure this design removes)', async () => {
		const small = new DataSource({
			type: 'postgres',
			url,
			entities: [],
			extra: { max: MAIN_POOL, connectionTimeoutMillis: 1000 },
		});
		await small.initialize();
		try {
			const outcomes = await Promise.allSettled(
				Array.from({ length: MAIN_POOL * 2 }, (_, i) =>
					withPayerLock(
						small,
						`cheqd1contrast${i}`,
						async () => {
							await small.query('SELECT 1');
							await sleep(100);
						},
						{ lockTimeoutMs: 20_000 }
					)
				)
			);
			expect(outcomes.some((outcome) => outcome.status === 'rejected')).toBe(true);
		} finally {
			await small.destroy();
		}
	});

	it('keeps writes for the same payer serialised, in arrival order', async () => {
		const order: number[] = [];
		let inside = 0;
		let overlap = 0;
		await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				withPayerLock(
					lockSource,
					'cheqd1samepayer',
					async () => {
						inside++;
						overlap = Math.max(overlap, inside);
						order.push(i);
						await writeUsingMainPool(30);
						inside--;
					},
					{ lockTimeoutMs: 30_000 }
				)
			)
		);
		expect(overlap).toBe(1);
		expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it('serialises the same payer across two separate lock pools (two instances)', async () => {
		const other = createPayerLockSource(main, { max: 2, idleTimeoutMillis: 5000, connectionTimeoutMillis: 200 });
		const a = lockSource.createQueryRunner!();
		const b = other.createQueryRunner!();
		await a.connect();
		await b.connect();
		try {
			const first = (await a.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
				'cheqd1crossinstance',
			])) as {
				locked: boolean;
			}[];
			const second = (await b.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
				'cheqd1crossinstance',
			])) as {
				locked: boolean;
			}[];
			expect(first[0].locked).toBe(true);
			expect(second[0].locked).toBe(false);
			await a.query('SELECT pg_advisory_unlock(hashtext($1))', ['cheqd1crossinstance']);
			const third = (await b.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
				'cheqd1crossinstance',
			])) as {
				locked: boolean;
			}[];
			expect(third[0].locked).toBe(true);
			await b.query('SELECT pg_advisory_unlock(hashtext($1))', ['cheqd1crossinstance']);
		} finally {
			await a.release();
			await b.release();
			await other.destroy();
		}
	});

	it('fails a write with LedgerUnavailable, not a stall, when every lock connection stays busy', async () => {
		const hold = Array.from({ length: LOCK_POOL }, (_, i) =>
			withPayerLock(lockSource, `cheqd1hog${i}`, () => sleep(1500), { lockTimeoutMs: 30_000 })
		);
		await sleep(200);
		await expect(
			withPayerLock(lockSource, 'cheqd1starved', async () => undefined, {
				lockTimeoutMs: 400,
				retryInitialMs: 10,
				retryMaxMs: 50,
			})
		).rejects.toMatchObject({ code: 'LedgerUnavailable' });
		await Promise.all(hold);
	});
});
