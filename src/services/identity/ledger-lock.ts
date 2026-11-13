/**
 * Serialises ledger writes per fee payer, across every instance of the web service.
 *
 * A cheqd transaction carries the payer account's sequence number. Two writes from the same payer that sign
 * at the same time pick the same sequence and one of them fails (`account sequence mismatch`). The lock is a
 * Postgres transaction-level advisory lock on `hashtext(<payer address>)`: held from before signing until the
 * transaction is broadcast and confirmed, released on commit, rollback or a lost connection.
 *
 * Used by the Credo engine now; the Veramo path is meant to wrap its own sign-and-broadcast the same way
 * (migration plan, section 3, "Ledger write ordering").
 *
 * Cost to keep in mind: the lock holds one pooled database connection for the duration of the write, so the
 * connection pool must be larger than the number of payers that can write at once.
 */

/** The part of a TypeORM `EntityManager` this helper needs. */
export interface LockManager {
	query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/** The part of a TypeORM `DataSource` this helper needs. `DataSource` satisfies it. */
export interface LockDataSource {
	readonly options: { readonly type: string };
	transaction<T>(work: (manager: LockManager) => Promise<T>): Promise<T>;
}

export interface AdvisoryLockOptions {
	/** Longest wait for the lock, in milliseconds. Defaults to 60 seconds; the write then fails instead of hanging. */
	lockTimeoutMs?: number;
}

export const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

// In-process fallback for databases without advisory locks (the in-memory development database). One chain of
// promises per key. It orders writes within this process only, which is all a single local process can need.
const localTails = new Map<string, Promise<unknown>>();

async function withLocalLock<T>(key: string, work: () => Promise<T>): Promise<T> {
	const previous = localTails.get(key) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(work);
	const tail = run.catch(() => undefined);
	localTails.set(key, tail);
	try {
		return await run;
	} finally {
		if (localTails.get(key) === tail) localTails.delete(key);
	}
}

/**
 * Runs `work` while holding `pg_advisory_xact_lock(hashtext(key))`. `work` runs inside the transaction that owns
 * the lock but does not receive it: the lock is what matters, not the transaction.
 */
export async function withAdvisoryLock<T>(
	dataSource: LockDataSource,
	key: string,
	work: () => Promise<T>,
	options: AdvisoryLockOptions = {}
): Promise<T> {
	if (!key) throw new Error('An advisory lock needs a non-empty key');

	if (dataSource.options.type !== 'postgres') {
		return withLocalLock(key, work);
	}

	const timeout = Math.max(1, Math.floor(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS));
	return dataSource.transaction(async (manager) => {
		// `lock_timeout` also bounds the wait for an advisory lock. `set_config(..., true)` is transaction-local.
		await manager.query(`SELECT set_config('lock_timeout', $1, true)`, [`${timeout}ms`]);
		await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [key]);
		return work();
	});
}

/** Orders ledger writes for one fee payer. `payerAddress` is the bech32 account address that pays the fee. */
export function withPayerLock<T>(
	dataSource: LockDataSource,
	payerAddress: string,
	work: () => Promise<T>,
	options?: AdvisoryLockOptions
): Promise<T> {
	if (!payerAddress) throw new Error('A payer lock needs the payer address');
	return withAdvisoryLock(dataSource, payerAddress, work, options);
}
