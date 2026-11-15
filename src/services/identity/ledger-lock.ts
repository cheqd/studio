/**
 * Serialises ledger writes per fee payer, across every instance of the web service (engine spec 3.4).
 *
 * A cheqd transaction carries the payer account's sequence number. Two writes from the same payer that sign
 * at the same time pick the same sequence and one of them fails (`account sequence mismatch`). Two layers:
 *
 *   1. An in-process FIFO queue per payer address. A second write from the same instance waits in memory and
 *      holds NO database connection.
 *   2. A session-level `pg_try_advisory_lock(hashtext(payerAddress))` on a dedicated connection, taken with
 *      retry and backoff, and released in a `finally`. It is held only while one write runs, so instances are
 *      serialised too, and a lost connection frees the lock.
 *
 * The wait for both layers together is bounded: past it the write is not attempted and `LedgerUnavailableError`
 * is thrown. Used by the Credo engine and by every Veramo path that spends from a customer's payer account.
 *
 * Cost to keep in mind: while a write runs it holds one connection per payer that is writing at once. Pass a
 * `LockDataSource` whose connections come from a dedicated pool (`createPayerLockSource`), never the main pool:
 * the write itself needs the main pool, so locks taken from it can exhaust it and stall the service. With the
 * dedicated pool, a write that finds every lock connection busy keeps retrying within its bounded wait, then
 * fails with `LedgerUnavailableError`.
 */

/** The part of a TypeORM `EntityManager` this helper needs. */
export interface LockManager {
	query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/** The part of a TypeORM `DataSource` this helper needs. `DataSource` satisfies it. */
export interface LockDataSource {
	readonly options: { readonly type: string };
	transaction<T>(work: (manager: LockManager) => Promise<T>): Promise<T>;
	/** A dedicated connection for a session-level lock. Optional so test doubles for other paths need not supply it. */
	createQueryRunner?(): LockRunner;
}

/** The part of a TypeORM `QueryRunner` the session lock needs: one connection, held until `release`. */
export interface LockRunner {
	connect(): Promise<unknown>;
	query(sql: string, parameters?: unknown[]): Promise<unknown>;
	release(): Promise<void>;
}

export interface AdvisoryLockOptions {
	/** Longest wait for the lock, in milliseconds. Defaults to 60 seconds; the write then fails instead of hanging. */
	lockTimeoutMs?: number;
}

export interface PayerLockOptions extends AdvisoryLockOptions {
	/** First pause between attempts at the database lock, in milliseconds (doubles up to `retryMaxMs`). */
	retryInitialMs?: number;
	retryMaxMs?: number;
	/** Injected by tests. */
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

/**
 * The payer's write queue is full of earlier writes, or another instance holds the payer lock, for longer than
 * the wait allows. Nothing was written. Maps to `LedgerUnavailable` (503 with Retry-After) in the engine error model.
 */
export class LedgerUnavailableError extends Error {
	readonly code = 'LedgerUnavailable';
	readonly retryAfterSeconds: number;
	/** Set by the idempotency layer when the outcome of an earlier attempt is unknown. */
	idempotencyKey?: string;

	constructor(message: string, retryAfterSeconds = 5) {
		super(message);
		this.name = 'LedgerUnavailable';
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

/** Every connection of the lock pool is in use. `withPayerLock` retries within its wait; it never reaches a caller. */
export class LockPoolBusyError extends Error {
	constructor() {
		super('Every payer-lock connection is in use');
		this.name = 'LockPoolBusyError';
	}
}

export const DEFAULT_LOCK_TIMEOUT_MS = 60_000;
export const DEFAULT_RETRY_INITIAL_MS = 25;
export const DEFAULT_RETRY_MAX_MS = 500;

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
 * Runs `work` while holding a transaction-level `pg_advisory_xact_lock(hashtext(key))`. `work` runs inside the transaction that owns
 * the lock but does not receive it: the lock is what matters, not the transaction. This holds a pooled connection
 * for the whole wait, so it is for short, rare critical sections (creating a tenant), NOT for ledger writes:
 * those use `withPayerLock`.
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

// ---- Payer lock ----------------------------------------------------------------------------------------

/** One FIFO queue per payer address. `busy` means a write holds the slot; waiters are served in arrival order. */
interface PayerQueue {
	busy: boolean;
	waiters: { grant: () => void }[];
}
const payerQueues = new Map<string, PayerQueue>();

/** Number of writes waiting in memory for this payer (tests and metrics). */
export function queuedWriteCount(payerAddress: string): number {
	return payerQueues.get(payerAddress)?.waiters.length ?? 0;
}

const unavailable = (payerAddress: string, waitedMs: number) =>
	new LedgerUnavailableError(
		`The ledger write for payer ${payerAddress} could not start within ${waitedMs}ms: another write for the same payer is still running`
	);

/** Takes this payer's in-process slot, waiting in memory (no connection) until `deadline`. Returns the release function. */
function acquireQueueSlot(
	payerAddress: string,
	deadline: number,
	options: Required<Pick<PayerLockOptions, 'now'>>,
	startedAt: number
): Promise<() => void> {
	let queue = payerQueues.get(payerAddress);
	if (!queue) {
		queue = { busy: false, waiters: [] };
		payerQueues.set(payerAddress, queue);
	}
	const owner = queue;
	const release = () => {
		const next = owner.waiters.shift();
		if (next) {
			next.grant(); // hand the slot straight to the next waiter: `busy` stays true
		} else {
			owner.busy = false;
			if (payerQueues.get(payerAddress) === owner) payerQueues.delete(payerAddress);
		}
	};
	if (!owner.busy) {
		owner.busy = true;
		return Promise.resolve(release);
	}
	return new Promise<() => void>((resolve, reject) => {
		const waiter = {
			grant: () => {
				clearTimeout(timer);
				resolve(release);
			},
		};
		const timer = setTimeout(
			() => {
				const index = owner.waiters.indexOf(waiter);
				if (index >= 0) owner.waiters.splice(index, 1);
				reject(unavailable(payerAddress, options.now() - startedAt));
			},
			Math.max(0, deadline - options.now())
		);
		owner.waiters.push(waiter);
	});
}

/**
 * Takes the session-level lock on a dedicated connection, retrying with backoff until `deadline`. The
 * connection is returned to the pool between attempts, so a long wait for another instance holds none.
 * Returns the runner that owns the lock; the caller must call `unlockPayer` with it.
 */
async function acquireSessionLock(
	dataSource: LockDataSource,
	payerAddress: string,
	deadline: number,
	options: Required<Pick<PayerLockOptions, 'now' | 'sleep' | 'retryInitialMs' | 'retryMaxMs'>>,
	startedAt: number
): Promise<LockRunner> {
	if (!dataSource.createQueryRunner) throw new Error('This data source cannot provide a dedicated connection');
	let pause = options.retryInitialMs;
	for (;;) {
		const runner = dataSource.createQueryRunner();
		let locked = false;
		try {
			await runner.connect();
		} catch (error) {
			await runner.release().catch(() => undefined);
			if (!(error instanceof LockPoolBusyError)) throw error;
			// No lock connection is free: wait and retry like a lock held elsewhere, within the same deadline
			const remaining = deadline - options.now();
			if (remaining <= 0) throw unavailable(payerAddress, options.now() - startedAt);
			await options.sleep(Math.min(remaining, Math.round(pause * (0.5 + Math.random()))));
			pause = Math.min(options.retryMaxMs, pause * 2);
			continue;
		}
		try {
			const rows = (await runner.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS locked`, [
				payerAddress,
			])) as { locked: boolean }[];
			locked = rows?.[0]?.locked === true;
		} catch (error) {
			await runner.release();
			throw error;
		}
		if (locked) return runner;
		await runner.release();

		const remaining = deadline - options.now();
		if (remaining <= 0) throw unavailable(payerAddress, options.now() - startedAt);
		// Jitter keeps instances from retrying in step
		const wait = Math.min(remaining, Math.round(pause * (0.5 + Math.random())));
		await options.sleep(wait);
		pause = Math.min(options.retryMaxMs, pause * 2);
	}
}

async function unlockPayer(runner: LockRunner, payerAddress: string): Promise<void> {
	try {
		await runner.query(`SELECT pg_advisory_unlock(hashtext($1))`, [payerAddress]);
	} catch {
		// The connection is suspect. Ending the session frees the lock, so try the blunt call, and if even that
		// fails there is nothing more to do here: the pool will drop a broken connection.
		try {
			await runner.query(`SELECT pg_advisory_unlock_all()`);
		} catch {
			/* ignore */
		}
	} finally {
		await runner.release();
	}
}

/**
 * Orders ledger writes for one fee payer. `payerAddress` is the bech32 account address that pays the fee.
 * Same-instance writers queue in memory in arrival order; across instances the session lock decides. The
 * timeout covers queueing and lock waiting together and is not applied to `work` itself (the request deadline is).
 */
export async function withPayerLock<T>(
	dataSource: LockDataSource,
	payerAddress: string,
	work: () => Promise<T>,
	options: PayerLockOptions = {}
): Promise<T> {
	if (!payerAddress) throw new Error('A payer lock needs the payer address');
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const startedAt = now();
	const deadline = startedAt + Math.max(1, Math.floor(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS));

	const releaseSlot = await acquireQueueSlot(payerAddress, deadline, { now }, startedAt);
	try {
		if (dataSource.options.type !== 'postgres') return await work();
		const runner = await acquireSessionLock(
			dataSource,
			payerAddress,
			deadline,
			{
				now,
				sleep,
				retryInitialMs: options.retryInitialMs ?? DEFAULT_RETRY_INITIAL_MS,
				retryMaxMs: options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS,
			},
			startedAt
		);
		try {
			return await work();
		} finally {
			await unlockPayer(runner, payerAddress);
		}
	} finally {
		releaseSlot();
	}
}
