import { describe, expect, it } from '@jest/globals';
import {
	DEFAULT_LOCK_TIMEOUT_MS,
	withAdvisoryLock,
	withPayerLock,
	type LockDataSource,
} from '../../../../src/services/identity/ledger-lock.js';

/** A fake Postgres data source: records every statement and whether the transaction committed or rolled back. */
function fakePostgres() {
	const statements: { sql: string; parameters?: unknown[] }[] = [];
	const log: string[] = [];
	const dataSource: LockDataSource = {
		options: { type: 'postgres' },
		async transaction(work) {
			log.push('begin');
			try {
				const result = await work({
					async query(sql, parameters) {
						statements.push({ sql, parameters });
						log.push(sql.includes('pg_advisory_xact_lock') ? 'lock' : 'set');
						return [];
					},
				});
				log.push('commit');
				return result;
			} catch (error) {
				log.push('rollback');
				throw error;
			}
		},
	};
	return { dataSource, statements, log };
}

describe('withPayerLock on Postgres', () => {
	it('takes pg_advisory_xact_lock(hashtext(address)) before the work, inside the transaction', async () => {
		const { dataSource, statements, log } = fakePostgres();
		const result = await withPayerLock(dataSource, 'cheqd1payer', async () => {
			log.push('work');
			return 42;
		});

		expect(result).toBe(42);
		expect(log).toEqual(['begin', 'set', 'lock', 'work', 'commit']);
		const lock = statements.find((s) => s.sql.includes('pg_advisory_xact_lock'));
		expect(lock?.sql).toBe('SELECT pg_advisory_xact_lock(hashtext($1))');
		expect(lock?.parameters).toEqual(['cheqd1payer']);
	});

	it('bounds the wait with a transaction-local lock_timeout', async () => {
		const { dataSource, statements } = fakePostgres();
		await withPayerLock(dataSource, 'cheqd1payer', async () => undefined);
		expect(statements[0].sql).toContain(`set_config('lock_timeout', $1, true)`);
		expect(statements[0].parameters).toEqual([`${DEFAULT_LOCK_TIMEOUT_MS}ms`]);

		const custom = fakePostgres();
		await withPayerLock(custom.dataSource, 'cheqd1payer', async () => undefined, { lockTimeoutMs: 2500 });
		expect(custom.statements[0].parameters).toEqual(['2500ms']);
	});

	it('rolls back, so the lock is released, and rethrows when the work fails', async () => {
		const { dataSource, log } = fakePostgres();
		await expect(
			withPayerLock(dataSource, 'cheqd1payer', async () => {
				throw new Error('broadcast failed');
			})
		).rejects.toThrow('broadcast failed');
		expect(log.at(-1)).toBe('rollback');
	});

	it('does not run the work when the lock cannot be taken', async () => {
		const dataSource: LockDataSource = {
			options: { type: 'postgres' },
			transaction: async (work) =>
				work({
					async query(sql) {
						if (sql.includes('pg_advisory_xact_lock'))
							throw new Error('canceling statement due to lock timeout');
						return [];
					},
				}),
		};
		let ran = false;
		await expect(
			withPayerLock(dataSource, 'cheqd1payer', async () => {
				ran = true;
			})
		).rejects.toThrow('lock timeout');
		expect(ran).toBe(false);
	});

	it('refuses an empty address or key', async () => {
		const { dataSource } = fakePostgres();
		expect(() => withPayerLock(dataSource, '', async () => 1)).toThrow('needs the payer address');
		await expect(withAdvisoryLock(dataSource, '', async () => 1)).rejects.toThrow('non-empty key');
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
