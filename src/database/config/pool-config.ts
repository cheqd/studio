/**
 * Connection pool settings, read from the environment (with the defaults below). Two pools exist:
 *
 *   - the main pool, used by every query Studio makes (`EXTERNAL_DB_POOL_*`);
 *   - a small dedicated pool that holds the per-payer ledger locks (`EXTERNAL_DB_LOCK_POOL_*`). A session-level
 *     advisory lock pins one connection for as long as a ledger write runs, so it must not come out of the main
 *     pool: the write itself needs the main pool (to resolve the payer and store results), and ten payers each
 *     holding a main-pool connection while waiting for an eleventh would stall the whole service.
 *
 * Each instance can open up to `EXTERNAL_DB_POOL_MAX + EXTERNAL_DB_LOCK_POOL_MAX` connections. Count both in the
 * cluster's `max_connections` budget, multiplied by the number of instances.
 */
export interface PoolSettings {
	/** Most connections the pool opens. */
	max: number;
	/** How long an idle connection is kept, in milliseconds. */
	idleTimeoutMillis: number;
	/** How long a caller waits for a free connection before the pool gives up, in milliseconds. */
	connectionTimeoutMillis: number;
}

export const DEFAULT_MAIN_POOL: PoolSettings = { max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 30_000 };
export const DEFAULT_LOCK_POOL: PoolSettings = { max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 };

type Environment = Record<string, string | undefined>;

function positiveInteger(env: Environment, name: string, fallback: number, minimum = 1): number {
	const raw = env[name];
	if (raw === undefined || raw.trim() === '') return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minimum) {
		throw new Error(`${name} must be an integer of at least ${minimum}, got "${raw}"`);
	}
	return value;
}

export function loadMainPoolSettings(env: Environment = process.env): PoolSettings {
	return {
		max: positiveInteger(env, 'EXTERNAL_DB_POOL_MAX', DEFAULT_MAIN_POOL.max),
		idleTimeoutMillis: positiveInteger(
			env,
			'EXTERNAL_DB_POOL_IDLE_TIMEOUT_MS',
			DEFAULT_MAIN_POOL.idleTimeoutMillis
		),
		connectionTimeoutMillis: positiveInteger(
			env,
			'EXTERNAL_DB_POOL_CONNECTION_TIMEOUT_MS',
			DEFAULT_MAIN_POOL.connectionTimeoutMillis
		),
	};
}

export function loadLockPoolSettings(env: Environment = process.env): PoolSettings {
	return {
		max: positiveInteger(env, 'EXTERNAL_DB_LOCK_POOL_MAX', DEFAULT_LOCK_POOL.max),
		idleTimeoutMillis: positiveInteger(
			env,
			'EXTERNAL_DB_LOCK_POOL_IDLE_TIMEOUT_MS',
			DEFAULT_LOCK_POOL.idleTimeoutMillis
		),
		connectionTimeoutMillis: positiveInteger(
			env,
			'EXTERNAL_DB_LOCK_POOL_CONNECTION_TIMEOUT_MS',
			DEFAULT_LOCK_POOL.connectionTimeoutMillis
		),
	};
}

/** The `extra` option TypeORM hands to the `pg` pool. */
export function toPgPoolExtra(settings: PoolSettings): Record<string, number> {
	return {
		max: settings.max,
		idleTimeoutMillis: settings.idleTimeoutMillis,
		connectionTimeoutMillis: settings.connectionTimeoutMillis,
	};
}
