/**
 * Routes that carry no resource id: the tenant comes only from the credential. Account B must see its own data, never
 * account A's, whatever identity hints it adds (`customerId` in the query, body or headers).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { startHarness, type Harness, type RequestOptions, type Tenant } from './harness/app.js';
import { expectNoLeak } from './helpers.js';

let h: Harness;
beforeAll(async () => {
	h = await startHarness();
});
afterAll(async () => {
	await h?.close();
});
beforeEach(() => h.resetRecorders());

type SelfScoped = {
	route: string;
	path: string;
	query?: Record<string, string>;
	/** The caller's own identifier that the response should contain, when the route returns tenant data. */
	own?: (t: Tenant) => string;
};

const selfScoped: SelfScoped[] = [
	{ route: 'GET /did/list', path: '/did/list', own: (t) => t.did },
	{ route: 'GET /resource/list', path: '/resource/list', own: (t) => t.resourceId },
	{ route: 'GET /credential-status/list', path: '/credential-status/list', own: (t) => t.statusRegistryId },
	{ route: 'GET /credentials/issued', path: '/credentials/issued', own: (t) => t.issuedCredentialId },
	{ route: 'GET /event/list', path: '/event/list', own: (t) => t.operationId },
	{ route: 'GET /account', path: '/account', own: (t) => t.customerId },
	{ route: 'GET /account/analytics', path: '/account/analytics' },
	{ route: 'GET /account/balances', path: '/account/balances' },
	{ route: 'GET /admin/organisation/get', path: '/admin/organisation/get', own: (t) => `Tenant ${t.name}` },
	{ route: 'GET /admin/api-key/list', path: '/admin/api-key/list', own: (t) => t.apiKey },
	{ route: 'GET /admin/api-key/get', path: '/admin/api-key/get', own: (t) => t.spareApiKey },
	{ route: 'GET /providers/activated', path: '/providers/activated', own: (t) => t.providerTenantId },
	{ route: 'GET /credentials/offers', path: '/credentials/offers', own: (t) => t.offerId },
	{ route: 'GET /credentials/received', path: '/credentials/received' },
	{ route: 'GET /trust-registry/accreditation/list', path: '/trust-registry/accreditation/list' },
];

/** Every way a client can try to name a tenant, layered on top of a legitimate API key for B. */
const hints = (victim: Tenant): Array<{ name: string; options: RequestOptions }> => [
	{ name: 'no hint', options: {} },
	{ name: 'query customerId', options: { query: { customerId: victim.customerId } } },
	{
		name: 'query customer_id and customer',
		options: { query: { customer_id: victim.customerId, customer: victim.customerId } },
	},
	{ name: 'header customer-id', options: { headers: { 'customer-id': victim.customerId } } },
	{ name: 'header x-customer-id', options: { headers: { 'x-customer-id': victim.customerId } } },
	{ name: 'query owner did', options: { query: { did: victim.did, holderDid: victim.did } } },
];

describe.each(selfScoped)('$route', (r) => {
	it.each([0, 1, 2, 3, 4])(`[${r.route}] returns only the caller's own data (hint %#)`, async (i) => {
		const victim = h.tenantA;
		const attacker = h.tenantB;
		const hint = hints(victim)[i];
		const before = await h.snapshot(victim);
		const res = await h.request('GET', r.path, {
			as: attacker,
			...hint.options,
			query: { ...r.query, ...hint.options.query },
		});
		const label = `${r.route} with ${hint.name}`;
		// A request that ignores the hint is 2xx. A request that rejects the hint outright (4xx) is also safe.
		expect({ label, serverError: res.status >= 500 }).toEqual({ label, serverError: false });
		expectNoLeak(res, victim, { query: hint.options.query, headers: hint.options.headers });
		if (r.own && res.status === 200) expect(res.text).toContain(r.own(attacker));
		expect(await h.snapshot(victim)).toEqual(before);
	});
});

// The route table spells this one `[GET /did/list]` etc.; the sixth hint (naming A's DID as a filter) is only safe on
// routes that filter by the caller's own rows, so it gets its own case.
describe.each(
	selfScoped.filter((r) =>
		['GET /resource/list', 'GET /credential-status/list', 'GET /credentials/received'].includes(r.route)
	)
)('$route with the victim DID as a filter', (r) => {
	it(`[${r.route}] a did filter cannot reach another tenant's rows`, async () => {
		const victim = h.tenantA;
		const res = await h.request('GET', r.path, {
			as: h.tenantB,
			query: { did: victim.did, holderDid: victim.did },
		});
		expectNoLeak(res, victim, { query: { did: victim.did, holderDid: victim.did } });
	});
});
