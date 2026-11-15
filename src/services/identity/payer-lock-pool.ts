import { DataSource } from 'typeorm';
import { Connection } from '../../database/connection/connection.js';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { loadLockPoolSettings, toPgPoolExtra } from '../../database/config/pool-config.js';
import type { PoolSettings } from '../../database/config/pool-config.js';
import { LockPoolBusyError } from './ledger-lock.js';
import type { LockDataSource, LockRunner } from './ledger-lock.js';

/**
 * A `LockDataSource` whose session locks live on their own small connection pool.
 *
 * A session-level advisory lock pins a connection until the ledger write finishes. Taken from the main pool, ten
 * payers writing at once would hold every connection while each write waited for another one to resolve its payer,
 * and the whole service would stall. Here the lock connections come from a separate pool (`EXTERNAL_DB_LOCK_POOL_*`),
 * so the main pool is never starved by writes in flight, and a write that cannot get a lock connection waits in
 * `withPayerLock`'s bounded retry loop (then `LedgerUnavailableError`, 503) instead of queueing unbounded.
 *
 * Transactions (used by `withAdvisoryLock`) stay on the main pool: they are short.
 */
export function createPayerLockSource(
	main: DataSource,
	settings: PoolSettings = loadLockPoolSettings()
): LockDataSource & { destroy(): Promise<void> } {
	if (main.options.type !== 'postgres') {
		// No advisory locks outside Postgres: `withPayerLock` uses its in-process queue only
		return {
			options: main.options,
			transaction: (work) => main.transaction((m) => work(m)),
			destroy: async () => undefined,
		};
	}

	let lockPool: Promise<DataSource> | undefined;
	const pool = (): Promise<DataSource> => {
		if (!lockPool) {
			const base = main.options as PostgresConnectionOptions;
			// Same server and credentials; no entities, migrations or schema work: it only runs lock statements.
			const source = new DataSource({
				type: 'postgres',
				host: base.host,
				port: base.port,
				username: base.username,
				password: base.password,
				database: base.database,
				ssl: base.ssl,
				url: base.url,
				extra: toPgPoolExtra(settings),
				entities: [],
				migrations: [],
				synchronize: false,
			});
			lockPool = source.initialize().catch((error) => {
				lockPool = undefined; // try again on the next call
				throw error;
			});
		}
		return lockPool;
	};

	return {
		/** Closes the lock pool (tests and shutdown). The main data source is not touched. */
		destroy: async () => {
			const open = lockPool;
			lockPool = undefined;
			if (open) await (await open).destroy();
		},
		options: main.options,
		transaction: (work) => main.transaction((manager) => work(manager)),
		createQueryRunner(): LockRunner {
			let runner: ReturnType<DataSource['createQueryRunner']> | undefined;
			return {
				async connect() {
					const source = await pool();
					const candidate = source.createQueryRunner();
					try {
						await candidate.connect();
					} catch (error) {
						await candidate.release().catch(() => undefined);
						// The pool's own connection timeout: every lock connection is in use right now
						if (/timeout exceeded when trying to connect/i.test(String((error as Error)?.message))) {
							throw new LockPoolBusyError();
						}
						throw error;
					}
					runner = candidate;
				},
				query(sql, parameters) {
					if (!runner) throw new Error('The lock connection is not open');
					return runner.query(sql, parameters);
				},
				async release() {
					const current = runner;
					runner = undefined;
					await current?.release();
				},
			};
		},
	};
}

let shared: LockDataSource | undefined;

/**
 * The process-wide lock source over Studio's database, shared by the Credo and Veramo write paths so both serialise
 * on the same payer queue and the same small pool. Built on first use.
 */
export function sharedPayerLockSource(): LockDataSource {
	shared ??= createPayerLockSource(Connection.instance.dbConnection);
	return shared;
}
