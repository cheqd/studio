import NodeCache from 'node-cache';

const ACCREDITATION_RESOLVE_CACHE_TTL_MS = 30_000;
const ACCREDITATION_RESOLVE_CACHE_MAX_ENTRIES = 200;

export function buildCacheKey(url: string, customerId?: string) {
	return `${customerId ?? 'anonymous'}::${url}`;
}

/** Short-lived cache of resolved accreditations, shared by the list route and the Veramo chain walk. */
const accreditationResolveCache = new NodeCache({
	stdTTL: ACCREDITATION_RESOLVE_CACHE_TTL_MS / 1000,
	checkperiod: 0,
	useClones: false,
	deleteOnExpire: true,
	maxKeys: ACCREDITATION_RESOLVE_CACHE_MAX_ENTRIES,
});

export const inFlightAccreditations = new Map<string, Promise<unknown>>();

export function getCachedAccreditation(key: string) {
	return accreditationResolveCache.get(key) ?? null;
}

/**
 * Never throws. node-cache refuses a new key once `maxKeys` are held, and with `checkperiod: 0` expired keys are
 * only dropped when they are read again, so the cache filled up for good and every later `set` threw: callers that
 * cached inside their try block then dropped the accreditation and resolved everything again on every request.
 * Expired entries are pruned first; if it is still full, the oldest entries make room.
 */
export function setCachedAccreditation(key: string, value: unknown) {
	if (
		!accreditationResolveCache.has(key) &&
		accreditationResolveCache.keys().length >= ACCREDITATION_RESOLVE_CACHE_MAX_ENTRIES
	) {
		// `get` deletes an expired key
		for (const existing of accreditationResolveCache.keys()) accreditationResolveCache.get(existing);
		const keys = accreditationResolveCache.keys();
		const excess = keys.length - ACCREDITATION_RESOLVE_CACHE_MAX_ENTRIES + 1;
		if (excess > 0) accreditationResolveCache.del(keys.slice(0, excess));
	}
	try {
		accreditationResolveCache.set(key, value);
	} catch {
		// A cache that cannot take the entry is a miss next time, never a failure of the caller
	}
}

/**
 * Dereferenced DID-Linked Resources by DID URL, for the accreditation list. A resource version never changes once it
 * is on the ledger, so its content can be kept much longer than the short cache above, and it is public ledger data,
 * so one entry serves every customer. Only the content is kept: the tracking status (revoked, suspended) is read
 * from Studio's table on every request, so a revocation shows at once. Bounded: the oldest entry makes room for a
 * new one (never an error when full). Failed or empty answers are not kept.
 */
export class ResourceContentCache<T> {
	private readonly entries = new Map<string, { value: T; expires: number }>();
	private readonly inFlight = new Map<string, Promise<T | null>>();

	constructor(
		private readonly options: { ttlMs: number; maxEntries: number; now?: () => number } = {
			ttlMs: 60 * 60 * 1000,
			maxEntries: 5000,
		}
	) {}

	private now() {
		return this.options.now?.() ?? Date.now();
	}

	/** The cached value, or the loader's (one load per URL at a time, however many callers ask). */
	async get(url: string, load: () => Promise<T | null>): Promise<T | null> {
		const hit = this.entries.get(url);
		if (hit && hit.expires > this.now()) {
			// Most recently used last, so eviction takes the least recently used
			this.entries.delete(url);
			this.entries.set(url, hit);
			return hit.value;
		}
		if (hit) this.entries.delete(url);
		const running = this.inFlight.get(url);
		if (running) return running;
		const loading = (async () => {
			try {
				const value = await load();
				if (value !== null && value !== undefined) this.set(url, value);
				return value;
			} finally {
				this.inFlight.delete(url);
			}
		})();
		this.inFlight.set(url, loading);
		return loading;
	}

	private set(url: string, value: T) {
		while (this.entries.size >= this.options.maxEntries) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
		this.entries.set(url, { value, expires: this.now() + this.options.ttlMs });
	}

	clear() {
		this.entries.clear();
		this.inFlight.clear();
	}
}

/** Accreditation credentials by resource DID URL (see `ResourceContentCache`). */
export const accreditationContentCache = new ResourceContentCache<{ resourceId: string; credential: unknown }>();
