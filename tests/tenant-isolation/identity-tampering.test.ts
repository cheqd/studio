/**
 * Identity tampering: forged or foreign `customer-id` headers, `id-token` and bearer mismatches, bad, revoked and
 * expired API keys, and requests with no credentials at all. The caller's tenant must always come from the verified
 * credential, never from a hint the client controls.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { startHarness, authHeaders, type Harness } from './harness/app.js';
import { stubToken, STUB_ISSUER } from './harness/tokens.js';
import { bugLabel, expectNoLeak, itFor } from './helpers.js';
import { sha256 } from '../../src/utils/index.js';
import routeInventory from './route-inventory.json' with { type: 'json' };

let h: Harness;
beforeAll(async () => {
	h = await startHarness();
});
afterAll(async () => {
	await h?.close();
});
beforeEach(() => h.resetRecorders());

/** Which tenant a request was served as. `/account` echoes the customer it resolved. */
async function whoAmI(headers: Record<string, string>) {
	const res = await h.request('GET', '/account', { headers });
	return { status: res.status, customerId: res.body?.customer?.customerId as string | undefined, text: res.text };
}

describe('API key beats every other hint', () => {
	it('[identity] x-api-key for B with `customer-id` naming A is served as B', async () => {
		const me = await whoAmI({ ...authHeaders(h.tenantB, 'apikey'), 'customer-id': h.tenantA.customerId });
		expect(me.customerId).toBe(h.tenantB.customerId);
	});

	it('[identity] x-api-key for B with an id-token and bearer for A is served as B', async () => {
		const me = await whoAmI({ ...authHeaders(h.tenantB, 'apikey'), ...authHeaders(h.tenantA, 'portal') });
		expect(me.customerId).toBe(h.tenantB.customerId);
	});

	it('[identity] x-api-key for B with an A user token as bearer is served as B', async () => {
		const me = await whoAmI({ ...authHeaders(h.tenantB, 'apikey'), ...authHeaders(h.tenantA, 'idtoken') });
		expect(me.customerId).toBe(h.tenantB.customerId);
	});

	it('[identity] an unknown API key is refused and never falls back to another credential', async () => {
		const me = await whoAmI({ 'x-api-key': 'caas_does_not_exist', ...authHeaders(h.tenantA, 'portal') });
		expect(me.status).toBe(401);
		expect(me.customerId).toBeUndefined();
	});

	it('[identity] a revoked API key is refused', async () => {
		await h.query('UPDATE "apiKey" SET "revoked" = true WHERE "fingerprint" = $1', [sha256(h.tenantC.spareApiKey)]);
		const me = await whoAmI({ 'x-api-key': h.tenantC.spareApiKey });
		expect(me.status).toBe(401);
	});

	itFor(it, 'ISO-008')(`[identity] an expired API key is refused${bugLabel('ISO-008')}`, async () => {
		await h.query('UPDATE "apiKey" SET "expiresAt" = now() - interval \'1 day\' WHERE "fingerprint" = $1', [
			sha256(h.tenantC.apiKey),
		]);
		const me = await whoAmI({ 'x-api-key': h.tenantC.apiKey });
		expect(me.status).toBe(401);
	});
});

describe('id-token and bearer (portal flow)', () => {
	it('[identity] a matching id-token and M2M bearer is served as the id-token’s tenant', async () => {
		const me = await whoAmI(authHeaders(h.tenantB, 'portal'));
		expect(me.customerId).toBe(h.tenantB.customerId);
	});

	it('[identity] an id-token for B with a bearer minted for A is still served as B, never A', async () => {
		const aBearer = authHeaders(h.tenantA, 'idtoken').authorization;
		const me = await whoAmI({
			authorization: aBearer,
			'id-token': authHeaders(h.tenantB, 'idtoken').authorization.slice('Bearer '.length),
		});
		expect(me.customerId).not.toBe(h.tenantA.customerId);
	});

	it('[identity] an id-token that fails verification is refused even beside a valid bearer', async () => {
		const me = await whoAmI({
			authorization: authHeaders(h.tenantB, 'portal').authorization,
			'id-token': 'not-a-real-token',
		});
		expect(me.status).toBeGreaterThanOrEqual(400);
		expect(me.customerId).toBeUndefined();
	});

	it('[identity] an expired id-token is refused', async () => {
		const expired = stubToken({ sub: h.tenantB.logToId, roles: ['r'], expired: true });
		const me = await whoAmI({ authorization: authHeaders(h.tenantB, 'portal').authorization, 'id-token': expired });
		expect(me.status).toBeGreaterThanOrEqual(400);
		expect(me.customerId).toBeUndefined();
	});

	it('[identity] an id-token from the wrong issuer is refused', async () => {
		const wrong = stubToken({ sub: h.tenantB.logToId, roles: ['r'], iss: 'http://attacker.invalid/oidc' });
		const me = await whoAmI({ authorization: authHeaders(h.tenantB, 'portal').authorization, 'id-token': wrong });
		expect(me.status).toBeGreaterThanOrEqual(400);
		expect(STUB_ISSUER).not.toBe('http://attacker.invalid/oidc');
	});

	it('[identity] an id-token for a subject with no Studio account is refused', async () => {
		const ghost = stubToken({ sub: 'logto-user-ghost', roles: ['r'] });
		const me = await whoAmI({ authorization: authHeaders(h.tenantB, 'portal').authorization, 'id-token': ghost });
		expect(me.status).toBeGreaterThanOrEqual(400);
		expect(me.customerId).toBeUndefined();
	});

	it('[identity] a bearer user token alone is served as its own tenant', async () => {
		const me = await whoAmI(authHeaders(h.tenantB, 'idtoken'));
		expect(me.customerId).toBe(h.tenantB.customerId);
	});

	it('[identity] a bearer token with no roles is refused', async () => {
		const bare = stubToken({ sub: h.tenantB.logToId });
		const me = await whoAmI({ authorization: `Bearer ${bare}` });
		expect(me.status).toBe(401);
	});
});

describe('customer-id header (machine-to-machine flow)', () => {
	it(`[identity] an M2M bearer with customer-id acts as the named customer, as the API documents`, async () => {
		const me = await whoAmI(authHeaders(h.tenantA, 'm2m'));
		expect(me.customerId).toBe(h.tenantA.customerId);
	});

	itFor(it, 'A-057')(
		`[identity] a signed token that belongs to user B cannot select tenant A through customer-id${bugLabel('A-057')}`,
		async () => {
			const scoped = stubToken({ sub: h.tenantB.logToId, scope: h.scopes.join(' '), roles: ['studio-user'] });
			const me = await whoAmI({ authorization: `Bearer ${scoped}`, 'customer-id': h.tenantA.customerId });
			expect(me.customerId).not.toBe(h.tenantA.customerId);
		}
	);

	itFor(it, 'A-057')(
		`[identity] a user token for B with customer-id naming A gets none of A\u2019s data from a tenant route${bugLabel('A-057')}`,
		async () => {
			const scoped = stubToken({ sub: h.tenantB.logToId, scope: h.scopes.join(' '), roles: ['studio-user'] });
			const res = await h.request('GET', '/admin/api-key/list', {
				headers: { authorization: `Bearer ${scoped}`, 'customer-id': h.tenantA.customerId },
			});
			expectNoLeak(res, h.tenantA, { headers: { 'customer-id': h.tenantA.customerId } });
			expect(res.status).toBeGreaterThanOrEqual(400);
		}
	);

	it('[identity] a customer-id that names no customer is refused, not defaulted', async () => {
		const me = await whoAmI({
			authorization: authHeaders(h.tenantA, 'm2m').authorization,
			'customer-id': '00000000-0000-4000-8000-000000000000',
		});
		expect(me.status).toBeGreaterThanOrEqual(400);
		expect(me.customerId).toBeUndefined();
	});

	it('[identity] a forged bearer is refused whatever customer-id says', async () => {
		const me = await whoAmI({ authorization: 'Bearer forged', 'customer-id': h.tenantA.customerId });
		expect(me.status).toBeGreaterThanOrEqual(400);
		expect(me.customerId).toBeUndefined();
	});

	itFor(it, 'A-057')(
		`[identity] an id-token and bearer for B with customer-id naming A never return A\u2019s keys${bugLabel('A-057')}`,
		async () => {
			const res = await h.request('GET', '/admin/api-key/list', {
				headers: { ...authHeaders(h.tenantB, 'portal'), 'customer-id': h.tenantA.customerId },
			});
			expectNoLeak(res, h.tenantA, { headers: { 'customer-id': h.tenantA.customerId } });
		}
	);
});

describe('no credentials', () => {
	type Entry = { method: string; path: string; sample: string; classification: string; unauthenticated: string };
	const entries = (routeInventory.routes as Entry[]).filter((r) => r.unauthenticated === 'must-refuse');

	it.each(entries.map((r) => [`${r.method} ${r.path}`, r] as const))(
		'[unauth %s] is refused and does nothing without credentials',
		async (_key, r) => {
			const before = await h.snapshot(h.tenantA);
			const res = await h.request(r.method, r.sample, { body: r.method === 'GET' ? undefined : {} });
			expect({ route: _key, status: res.status, ok: res.status < 300 }).toEqual({
				route: _key,
				status: res.status,
				ok: false,
			});
			expect(h.allWrites()).toEqual([]);
			expectNoLeak(res, h.tenantA, r.sample);
			expect(await h.snapshot(h.tenantA)).toEqual(before);
		}
	);
});
