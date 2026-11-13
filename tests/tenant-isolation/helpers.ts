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
	'A-056': {
		id: 'A-056',
		action: 'A-056',
		summary:
			'validateCredentialAccess() (postgres.ts) treats IdentifierService.find() as a boolean, but find() returns a findAndCount tuple (or [] on error), which is always truthy. The issuer-ownership check on revoke, suspend and reinstate never fails.',
	},
	'ISO-001': {
		id: 'ISO-001',
		summary:
			'Same defect class as A-056: every `if (!(await IdentifierService.instance.find({ did, customer })))` guard in PostgresIdentityService (updateDid, deactivateDid, createResource, createCredential, updateUnencryptedStatusList, updateEncryptedStatusList, checkStatusList2021, broadcastStatusList*) is dead code, so a tenant can drive writes against a DID it does not own.',
	},
	'ISO-002': {
		id: 'ISO-002',
		summary:
			'POST /presentation/create never checks that holderDid belongs to the caller, so a tenant can have a presentation built and signed for another tenant’s DID.',
	},
	'ISO-003': {
		id: 'ISO-003',
		summary:
			'importDid() and importKey() reassign an existing identifier or key row to the importing customer unconditionally (IdentifierService.update / KeyService.update), with no check that another customer already owns it.',
	},
	'ISO-004': {
		id: 'ISO-004',
		summary:
			'API-key update, revoke and get take the raw key from the request and never compare its owner with the caller. Possession of a key is treated as authority over it, across tenants.',
	},
	'ISO-005': {
		id: 'ISO-005',
		summary:
			'GET /admin/subscription/list calls stripe.subscriptions.list() with no customer filter when the caller has no paymentProviderId, which returns every customer’s subscriptions.',
	},
	'ISO-006': {
		id: 'ISO-006',
		summary:
			'POST /admin/subscription/resume (and cancel, when its auth rule matches) and GET /admin/checkout/session/:id act on a Stripe object named by the client without checking it belongs to the caller’s Stripe customer.',
	},
	'ISO-007': {
		id: 'ISO-007',
		summary:
			'The documented machine-to-machine flow (bearer token plus `customer-id` header) cannot work. M2MCredsTokenUserInfoFetcher is constructed with the `customer-id` header value and verifies that value as the JWT, so every such request fails with 500 and the bearer token is never read. Not exploitable today, but a repair that trusts the header after checking only that some signed token is present would let any user token act as any customer; the protective case beside this one must keep passing when it is repaired.',
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

export type BugId =
	| 'A-056'
	| 'ISO-001'
	| 'ISO-002'
	| 'ISO-003'
	| 'ISO-004'
	| 'ISO-005'
	| 'ISO-006'
	| 'ISO-007'
	| 'ISO-008'
	| 'ISO-009';

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
