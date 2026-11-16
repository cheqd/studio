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

export function setCachedAccreditation(key: string, value: unknown) {
	accreditationResolveCache.set(key, value);
}
