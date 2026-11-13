/**
 * Policy for machine-to-machine (M2M) callers.
 *
 * A valid token from the identity provider is not enough on its own: the token must be issued for this API
 * (audience), come from a client we know about (azp / client_id), and that client must be allowed to act for
 * the customer named in the `customer-id` header. Everything here fails closed.
 *
 * Configuration: `M2M_CLIENT_CUSTOMER_MAP`, a JSON object mapping each M2M client id to either an array of
 * customer ids it may act for, or the string "*" (any customer, only when explicitly configured), e.g.
 *   {"m2m-client-a":["customer-id-1","customer-id-2"],"m2m-admin-client":"*"}
 * The keys of the map are the allowlist of M2M client ids. Unset, empty or malformed means no M2M access.
 */

export const M2M_CLIENT_CUSTOMER_MAP_ENV = 'M2M_CLIENT_CUSTOMER_MAP';

export type M2MClientCustomerMap = Map<string, '*' | Set<string>>;

export type M2MPolicyDecision = { allowed: true } | { allowed: false; status: 400 | 401 | 403; error: string };

/**
 * Parse the client-to-customer map. Returns an empty map (denying everyone) when it is unset or invalid.
 */
export function parseM2MClientCustomerMap(raw: string | undefined): M2MClientCustomerMap {
	const map: M2MClientCustomerMap = new Map();
	if (!raw || !raw.trim()) return map;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return new Map();
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map();
	for (const [clientId, customers] of Object.entries(parsed)) {
		if (!clientId) return new Map();
		if (customers === '*') {
			map.set(clientId, '*');
		} else if (
			Array.isArray(customers) &&
			customers.length > 0 &&
			customers.every((c) => typeof c === 'string' && c.length > 0)
		) {
			map.set(clientId, new Set(customers as string[]));
		} else {
			// A malformed entry invalidates the whole map rather than silently widening or dropping access.
			return new Map();
		}
	}
	return map;
}

export function authoriseM2MRequest(
	payload: { aud?: unknown; azp?: unknown; client_id?: unknown },
	customerIdHeader: string | string[] | undefined,
	env: NodeJS.ProcessEnv = process.env
): M2MPolicyDecision {
	const deny = (status: 400 | 401 | 403, error: string): M2MPolicyDecision => ({ allowed: false, status, error });

	const expectedAudience = env.LOGTO_DEFAULT_RESOURCE_URL;
	if (!expectedAudience) return deny(403, 'M2M access is not configured: expected audience is not set.');
	const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
	if (!audiences.includes(expectedAudience)) return deny(401, 'Unauthorized error: Invalid audience in the token.');

	const clients = parseM2MClientCustomerMap(env[M2M_CLIENT_CUSTOMER_MAP_ENV]);
	if (clients.size === 0) return deny(403, 'M2M access is not configured: no M2M clients are allowed.');

	const clientId = typeof payload.azp === 'string' && payload.azp ? payload.azp : payload.client_id;
	if (typeof clientId !== 'string' || !clients.has(clientId)) {
		return deny(403, 'Forbidden error: M2M client is not allowed.');
	}

	if (typeof customerIdHeader !== 'string' || !customerIdHeader) {
		return deny(400, 'Bad request: exactly one customer-id header is required for M2M requests.');
	}
	const allowed = clients.get(clientId);
	if (allowed !== '*' && !allowed?.has(customerIdHeader)) {
		return deny(403, 'Forbidden error: M2M client is not allowed to act for this customer.');
	}
	return { allowed: true };
}
