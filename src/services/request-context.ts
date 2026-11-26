import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * What the router and the operation tracker need to know about the request they are serving, without every
 * function between them passing it along. Holds ids, timings and routing decisions only: never bodies, claims or
 * keys (engine spec 4.3).
 */

export interface RoutingRecord {
	routeFamily: string;
	/** `veramo`, `credo`, or `none` when the router refused the request (for example `Gone`). */
	engine: string;
	/** What chose the engine: `artifact`, `flag`, `exception` or `default`. */
	reason: string;
	/** Which exception, when `reason` is `exception`. */
	rule?: string;
	customerId?: string;
}

/**
 * How the caller authenticated, set by the API guard once authentication has succeeded: an API key, the portal (a
 * user session: Logto ID token plus the portal's machine token), a bare Logto access token, the machine-to-machine
 * customer path, or the Swagger UI session.
 */
export type AuthMethod = 'api-key' | 'portal' | 'id-token' | 'm2m' | 'swagger-ui';

export interface RequestContext {
	requestId: string;
	startedAt: number;
	customerId?: string;
	authMethod?: AuthMethod;
	decisions: RoutingRecord[];
}

const storage = new AsyncLocalStorage<RequestContext>();

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Uses the caller's `X-Request-Id` when it is a plain token (so it can be correlated), else makes one. */
export function newRequestId(incoming?: unknown): string {
	const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
	return typeof candidate === 'string' && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

export function runWithRequestContext<T>(context: RequestContext, work: () => T): T {
	return storage.run(context, work);
}

export function currentRequestContext(): RequestContext | undefined {
	return storage.getStore();
}

export function startRequestContext(incomingRequestId?: unknown, now: number = Date.now()): RequestContext {
	return { requestId: newRequestId(incomingRequestId), startedAt: now, decisions: [] };
}
