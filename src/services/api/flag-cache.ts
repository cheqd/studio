/**
 * In-process cache for feature-flag reads (engine spec 4.2).
 *
 *   - TTL 5 seconds, so a switch flipped on `PUT /admin/flags` reaches every instance within the TTL.
 *   - Fail safe: if a read fails, the last known value is returned, however old. If there is none, the loader's
 *     `fallback` (the compiled default, i.e. no rows) is returned. A failed read never fails the request.
 *   - After a failed read the cache does not retry for a short pause, so a database outage does not add a failing
 *     query to every request.
 *   - Concurrent reads of the same key share one query.
 *   - `invalidate()` drops everything, and is called by the flag write on the instance that handled it.
 */
export const FLAG_CACHE_TTL_MS = 5_000;
export const FLAG_CACHE_FAILURE_PAUSE_MS = 1_000;
const MAX_ENTRIES = 5_000;

interface Entry<T> {
	value: T;
	fetchedAt: number;
}

export interface FlagCacheOptions {
	ttlMs?: number;
	failurePauseMs?: number;
	now?: () => number;
	/** Called when a read fails, with whether a last-known value was used. For logging. */
	onFailure?: (key: string, error: unknown, usedLastKnown: boolean) => void;
}

export class FlagCache<T> {
	private readonly entries = new Map<string, Entry<T>>();
	private readonly inFlight = new Map<string, Promise<T>>();
	private readonly pausedUntil = new Map<string, number>();
	private generation = 0;
	private readonly ttlMs: number;
	private readonly failurePauseMs: number;
	private readonly now: () => number;
	private readonly onFailure?: FlagCacheOptions['onFailure'];

	constructor(options: FlagCacheOptions = {}) {
		this.ttlMs = options.ttlMs ?? FLAG_CACHE_TTL_MS;
		this.failurePauseMs = options.failurePauseMs ?? FLAG_CACHE_FAILURE_PAUSE_MS;
		this.now = options.now ?? Date.now;
		this.onFailure = options.onFailure;
	}

	async get(key: string, load: () => Promise<T>, fallback: T): Promise<T> {
		const entry = this.entries.get(key);
		const now = this.now();
		if (entry && now - entry.fetchedAt < this.ttlMs) return entry.value;
		if (entry && now < (this.pausedUntil.get(key) ?? 0)) return entry.value;

		const pending = this.inFlight.get(key);
		if (pending) return pending;

		const generation = this.generation;
		let read: Promise<T> | undefined;
		read = (async () => {
			try {
				const value = await load();
				// A write that invalidated the cache while this read was running makes its result suspect: use it
				// for this caller, but do not keep it.
				if (generation === this.generation) this.store(key, value);
				this.pausedUntil.delete(key);
				return value;
			} catch (error) {
				const lastKnown = this.entries.get(key);
				this.pausedUntil.set(key, this.now() + this.failurePauseMs);
				try {
					this.onFailure?.(key, error, lastKnown !== undefined);
				} catch {
					/* logging must not fail the request */
				}
				return lastKnown ? lastKnown.value : fallback;
			} finally {
				if (this.inFlight.get(key) === read) this.inFlight.delete(key);
			}
		})();
		this.inFlight.set(key, read);
		return read;
	}

	/**
	 * Marks every cached value stale: the next read of each key goes to the database. The old values stay as
	 * last-known values, in case that read fails.
	 */
	invalidate(): void {
		this.generation++;
		for (const entry of this.entries.values()) entry.fetchedAt = Number.NEGATIVE_INFINITY;
		this.pausedUntil.clear();
		this.inFlight.clear();
	}

	private store(key: string, value: T): void {
		if (this.entries.size >= MAX_ENTRIES && !this.entries.has(key)) {
			const oldest = this.entries.keys().next().value;
			if (oldest !== undefined) this.entries.delete(oldest);
		}
		this.entries.set(key, { value, fetchedAt: this.now() });
	}
}
