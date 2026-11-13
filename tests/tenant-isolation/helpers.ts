import { expect } from '@jest/globals';
import type { ApiResponse, Harness, RequestOptions, Tenant, VeramoCall } from './harness/app.js';
import { veramoCalls } from './harness/app.js';

export type KnownBug = {
	/** Stable id, quoted in the report and the inventory. */
	id: string;
	/** Action-log reference where there is one. */
	action?: string;
	summary: string;
};

/** Every known defect. A test tied to one runs as `it.failing`: it passes while the bug exists and fails once fixed. */
export const KNOWN_BUGS: Record<string, KnownBug> = {
	'A-057': {
		id: 'A-057',
		action: 'A-057',
		summary:
			'The M2M auth path trusts the `customer-id` header after verifying only that the bearer token is signed by the trusted issuer, so any signed user token can act as any customer. Fix is tracked as A-057 (F-07) on a separate branch; these cases pass once it lands.',
	},

	'ISO-009': {
		id: 'ISO-009',
		summary:
			'DELETE /admin/subscription/cancel is registered in app.ts but its auth rule is registered for POST, so the guard answers 400 "No auth rules" and a customer can never cancel their own subscription. It also means the cross-tenant cancel is only blocked by accident.',
	},
	'ISO-008': {
		id: 'ISO-008',
		summary:
			'API key expiry is never enforced: APIKeyService.get() only rejects revoked keys although its comment says it validates expiry.',
	},
};

export type BugId = 'A-057' | 'ISO-008' | 'ISO-009';

/** `it` for a normal case, `it.failing` for a case whose assertions fail today because of a known bug. */
export function itFor(test: any, bug?: BugId) {
	if (!bug || ENFORCE_KNOWN_BUGS) return test;
	return test.failing;
}

/**
 * Set ISOLATION_ENFORCE_KNOWN_BUGS=1 to run the known-bug cases as ordinary tests. On a branch that fixes a bug they
 * must then pass; on main they fail, which is how you see each bug's actual failure message.
 */
export const ENFORCE_KNOWN_BUGS = process.env.ISOLATION_ENFORCE_KNOWN_BUGS === '1';

export function bugLabel(bug?: BugId) {
	return bug ? ` [KNOWN BUG ${bug}${KNOWN_BUGS[bug].action ? ` / ${KNOWN_BUGS[bug].action}` : ''}]` : '';
}

export function mentions(value: unknown, tenant: Tenant): string[] {
	const haystack = typeof value === 'string' ? value : JSON.stringify(value);
	return tenant.markers.filter((marker) => haystack.includes(marker));
}

/**
 * The response must not contain any of the victim's identifiers, except ones the attacker itself put in the request
 * (an error that echoes the id you asked about reveals nothing).
 */
export function expectNoLeak(response: ApiResponse, victim: Tenant, sent: unknown = '') {
	const echoed = decodeURIComponent(JSON.stringify(sent));
	const leaked = mentions(response.text, victim).filter((marker) => !echoed.includes(marker));
	expect({ leaked }).toEqual({ leaked: [] });
}

export function expectNotSuccessful(response: ApiResponse) {
	expect({ status: response.status, ok: response.status >= 200 && response.status < 300 }).toEqual({
		status: response.status,
		ok: false,
	});
}

export function callsTo(methods: string[]): VeramoCall[] {
	return veramoCalls.filter((c) => methods.includes(c.method));
}

export async function send(h: Harness, spec: { method: string; path: string } & RequestOptions): Promise<ApiResponse> {
	const { method, path, ...options } = spec;
	return h.request(method, path, options);
}

export function sameRows(before: Record<string, unknown>, after: Record<string, unknown>) {
	expect(after).toEqual(before);
}
