import { describe, expect, it, jest } from '@jest/globals';
import {
	DEFAULT_LOCK_TIMEOUT_MS,
	LedgerUnavailableError,
	queuedWriteCount,
	withAdvisoryLock,
	withPayerLock,
	type LockDataSource,
} from '../../../../src/services/identity/ledger-lock.js';

/**
 * A fake Postgres data source. `held` is the set of payers whose session lock is taken; `foreign` makes
 * `pg_try_advisory_lock` fail a number of times, as if another instance held the lock.
 */
function fakePostgres(foreign = 0) {
	const statements: { sql: string; parameters?: unknown[] }[] = [];
	const log: string[] = [];
	const held = new Set<string>();
	let open = 0;
	let maxOpen = 0;
	let refusals = foreign;
	const dataSource: LockDataSource = {
		options: { type: 'postgres' },
		async transaction(work) {
			log.push('begin');
			const result = await work({ query: async () => [] });
			log.push('commit');
			return result;
		},
		createQueryRunner() {
			return {
				async connect() {
					open++;
					maxOpen = Math.max(maxOpen, open);
				},
				async query(sql: string, parameters?: unknown[]) {
					statements.push({ sql, parameters });
					const address = String(parameters?.[0]);
					if (sql.includes('pg_try_advisory_lock')) {
						if (refusals > 0) {
							refusals--;
							log.push('refused');
							return [{ locked: false }];
						}
						held.add(address);
						log.push('lock');
						return [{ locked: true }];
					}
					if (sql.includes('pg_advisory_unlock(')) {
						held.delete(address);
						log.push('unlock');
					}
					return [];
				},
				async release() {
					open--;
					log.push('release');
				},
			};
		},
	};
	return { dataSource, statements, log, held, open: () => open, maxOpen: () => maxOpen };
}

const instant = { sleep: async () => undefined };

describe('withPayerLock on Postgres', () => {
	it('takes a session-level pg_try_advisory_lock before the work and unlocks after, on one connection', async () => {
		const { dataSource, statements, log } = fakePostgres();
		const result = await withPayerLock(dataSource, 'cheqd1payer', async () => {
			log.push('work');
			return 42;
		});

		expect(result).toBe(42);
		expect(log).toEqual(['lock', 'work', 'unlock', 'release']);
		expect(statements[0].sql).toBe('SELECT pg_try_advisory_lock(hashtext($1)) AS locked');
		expect(statements[0].parameters).toEqual(['cheqd1payer']);
		expect(statements[1].sql).toBe('SELECT pg_advisory_unlock(hashtext($1))');
		expect(log).not.toContain('begin');
	});

	it('retries with backoff, giving the connection back between attempts', async () => {
		const { dataSource, log, maxOpen } = fakePostgres(3);
		const sleeps: number[] = [];
		await withPayerLock(dataSource, 'cheqd1payer', async () => log.push('work'), {
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		expect(log.filter((entry) => entry === 'refused')).toHaveLength(3);
		expect(log.indexOf('work')).toBeGreaterThan(log.lastIndexOf('refused'));
		expect(sleeps).toHaveLength(3);
		expect(maxOpen()).toBe(1);
	});

	it('fails with LedgerUnavailable when the lock cannot be had in time, and never runs the work', async () => {
		const { dataSource, open } = fakePostgres(Number.MAX_SAFE_INTEGER);
		let clock = 0;
		let ran = false;
		const error = await withPayerLock(
			dataSource,
			'cheqd1payer',
			async () => {
				ran = true;
			},
			{
				lockTimeoutMs: 1000,
				now: () => clock,
				sleep: async (ms) => {
					clock += ms;
				},
			}
		).catch((e) => e);
		expect(error).toBeInstanceOf(LedgerUnavailableError);
		expect(error.code).toBe('LedgerUnavailable');
		expect(error.retryAfterSeconds).toBeGreaterThan(0);
		expect(ran).toBe(false);
		expect(open()).toBe(0);
	});

	it('unlocks and releases the connection when the work fails', async () => {
		const { dataSource, log, held, open } = fakePostgres();
		await expect(
			withPayerLock(dataSource, 'cheqd1payer', async () => {
				throw new Error('broadcast failed');
			})
		).rejects.toThrow('broadcast failed');
		expect(log.slice(-2)).toEqual(['unlock', 'release']);
		expect(held.size).toBe(0);
		expect(open()).toBe(0);
	});

	it('falls back to pg_advisory_unlock_all if the unlock itself fails, and still releases', async () => {
		const calls: string[] = [];
		const dataSource: LockDataSource = {
			options: { type: 'postgres' },
			transaction: async () => {
				throw new Error('unused');
			},
			createQueryRunner: () => ({
				connect: async () => undefined,
				query: async (sql: string) => {
					calls.push(sql);
					if (sql.includes('try_advisory')) return [{ locked: true }];
					if (sql.includes('pg_advisory_unlock(')) throw new Error('connection reset');
					return [];
				},
				release: async () => {
					calls.push('release');
				},
			}),
		};
		await withPayerLock(dataSource, 'cheqd1payer', async () => undefined);
		expect(calls.at(-2)).toContain('pg_advisory_unlock_all');
		expect(calls.at(-1)).toBe('release');
	});

	it('queues same-payer writers in memory in FIFO order and holds no connection while they wait', async () => {
		const { dataSource, open, maxOpen } = fakePostgres();
		const order: string[] = [];
		const gates: (() => void)[] = [];
		const write = (name: string) =>
			withPayerLock(dataSource, 'cheqd1fifo', async () => {
				order.push(`${name}:start`);
				await new Promise<void>((resolve) => gates.push(resolve));
				order.push(`${name}:end`);
			});
		const all = [write('a'), write('b'), write('c')];
		await new Promise((resolve) => setImmediate(resolve));
		expect(order).toEqual(['a:start']);
		expect(queuedWriteCount('cheqd1fifo')).toBe(2);
		expect(open()).toBe(1); // only the running write has a connection

		for (let i = 0; i < 3; i++) {
			while (gates.length === 0) await new Promise((resolve) => setImmediate(resolve));
			gates.shift()?.();
			await new Promise((resolve) => setImmediate(resolve));
		}
		await Promise.all(all);
		expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
		expect(maxOpen()).toBe(1);
		expect(queuedWriteCount('cheqd1fifo')).toBe(0);
	});

	it('times out a waiter in the queue with LedgerUnavailable, without disturbing the others', async () => {
		jest.useFakeTimers();
		try {
			const { dataSource } = fakePostgres();
			let release: () => void = () => undefined;
			const running = withPayerLock(
				dataSource,
				'cheqd1slow',
				() => new Promise<void>((resolve) => (release = resolve))
			);
			const impatient = withPayerLock(dataSource, 'cheqd1slow', async () => 'late', { lockTimeoutMs: 100 });
			const patient = withPayerLock(dataSource, 'cheqd1slow', async () => 'patient', { lockTimeoutMs: 10_000 });
			const impatientResult = impatient.catch((e) => e);
			await jest.advanceTimersByTimeAsync(150);
			expect(await impatientResult).toBeInstanceOf(LedgerUnavailableError);
			release();
			await running;
			expect(await patient).toBe('patient');
			expect(queuedWriteCount('cheqd1slow')).toBe(0);
		} finally {
			jest.useRealTimers();
		}
	});

	it('does not block different payers', async () => {
		const { dataSource } = fakePostgres();
		let release: () => void = () => undefined;
		const first = withPayerLock(dataSource, 'cheqd1one', () => new Promise<void>((r) => (release = r)));
		expect(await withPayerLock(dataSource, 'cheqd1two', async () => 'free', instant)).toBe('free');
		release();
		await first;
	});

	it('refuses an empty address or key', async () => {
		const { dataSource } = fakePostgres();
		await expect(withPayerLock(dataSource, '', async () => 1)).rejects.toThrow('needs the payer address');
		await expect(withAdvisoryLock(dataSource, '', async () => 1)).rejects.toThrow('non-empty key');
	});
});

describe('withAdvisoryLock (transaction-level, for rare short sections)', () => {
	it('takes pg_advisory_xact_lock inside a transaction with a transaction-local lock_timeout', async () => {
		const statements: { sql: string; parameters?: unknown[] }[] = [];
		const dataSource: LockDataSource = {
			options: { type: 'postgres' },
			transaction: async (work) =>
				work({
					async query(sql, parameters) {
						statements.push({ sql, parameters });
						return [];
					},
				}),
		};
		await withAdvisoryLock(dataSource, 'credo-tenant:1', async () => undefined, { lockTimeoutMs: 2500 });
		expect(statements[0].sql).toContain(`set_config('lock_timeout', $1, true)`);
		expect(statements[0].parameters).toEqual(['2500ms']);
		expect(statements[1].sql).toBe('SELECT pg_advisory_xact_lock(hashtext($1))');
		expect(DEFAULT_LOCK_TIMEOUT_MS).toBe(60_000);
	});
});

describe('without Postgres (in-memory development database)', () => {
	const memory: LockDataSource = {
		options: { type: 'sqljs' },
		transaction: async () => {
			throw new Error('must not open a transaction');
		},
	};
	const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	it('orders writes for the same payer within the process', async () => {
		const events: string[] = [];
		const write = (name: string, ms: number) =>
			withPayerLock(memory, 'cheqd1same', async () => {
				events.push(`${name}:start`);
				await pause(ms);
				events.push(`${name}:end`);
			});
		await Promise.all([write('a', 20), write('b', 1), write('c', 1)]);
		expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
	});

	it('lets different payers write at the same time', async () => {
		const events: string[] = [];
		const write = (payer: string) =>
			withPayerLock(memory, payer, async () => {
				events.push(`${payer}:start`);
				await pause(10);
				events.push(`${payer}:end`);
			});
		await Promise.all([write('cheqd1one'), write('cheqd1two')]);
		expect(events.slice(0, 2).sort()).toEqual(['cheqd1one:start', 'cheqd1two:start']);
	});

	it('keeps going after a failed write', async () => {
		await expect(
			withPayerLock(memory, 'cheqd1same', async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(await withPayerLock(memory, 'cheqd1same', async () => 'ok')).toBe('ok');
	});
});
