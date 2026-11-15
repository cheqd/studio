/**
 * Routes that create or change the caller's own records. A client-supplied identity (`customerId` in the body or query,
 * a `customer-id` header) must never redirect the write to another tenant, and nothing A owns may change.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import { startHarness, type Harness } from './harness/app.js';
import { expectNoLeak } from './helpers.js';

let h: Harness;
beforeAll(async () => {
	h = await startHarness();
});
afterAll(async () => {
	await h?.close();
});
beforeEach(() => h.resetRecorders());

const forged = () => ({
	body: { customerId: h.tenantA.customerId, customer: { customerId: h.tenantA.customerId } },
	query: { customerId: h.tenantA.customerId },
	headers: { 'customer-id': h.tenantA.customerId },
});

async function expectVictimUntouched(before: Record<string, unknown>) {
	expect(await h.snapshot(h.tenantA)).toEqual(before);
}

describe('POST /admin/organisation/update', () => {
	it('[POST /admin/organisation/update] updates the caller, not the customerId named in the body, query or header', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/admin/organisation/update', {
			as: h.tenantB,
			body: { name: 'Renamed By B', description: 'hello', ...f.body },
			query: f.query,
			headers: f.headers,
		});
		expect(res.status).toBeLessThan(500);
		await expectVictimUntouched(before);
		const [b] = await h.query('SELECT "name" FROM "customer" WHERE "customerId" = $1', [h.tenantB.customerId]);
		expect(b.name).toBe('Renamed By B');
		expectNoLeak(res, h.tenantA, { body: f.body, query: f.query, headers: f.headers });
	});
});

describe('POST /admin/api-key/create', () => {
	it('[POST /admin/api-key/create] issues the key to the caller, not the customerId named in the request', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/admin/api-key/create', {
			as: h.tenantB,
			body: { name: 'forged', ...f.body },
			query: f.query,
			headers: f.headers,
		});
		expect(res.status).toBe(201);
		await expectVictimUntouched(before);
		const rows = await h.query('SELECT "customerId" FROM "apiKey" WHERE "name" = $1', ['forged']);
		expect(rows).toEqual([{ customerId: h.tenantB.customerId }]);
	});
});

describe('POST /key/create', () => {
	it('[POST /key/create] attaches the new key to the caller, not the customerId named in the request', async () => {
		h.stubVeramo('createKey', async () => {
			const kid = randomBytes(32).toString('hex');
			await h.query(
				`INSERT INTO "key" ("kid","kms","type","publicKeyHex","meta") VALUES ($1,'postgres','Ed25519',$1,'{}')`,
				[kid]
			);
			return { kid, kms: 'postgres', type: 'Ed25519', publicKeyHex: kid };
		});
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/key/create', {
			as: h.tenantB,
			body: f.body,
			query: f.query,
			headers: f.headers,
		});
		expect(res.status).toBe(200);
		await expectVictimUntouched(before);
		const [row] = await h.query('SELECT "customerId" FROM "key" WHERE "kid" = $1', [res.body.kid]);
		expect(row.customerId).toBe(h.tenantB.customerId);
	});
});

describe('POST /did/create', () => {
	it('[POST /did/create] attaches the new DID to the caller, not the customerId named in the request', async () => {
		h.stubVeramo('createKey', async () => {
			const kid = randomBytes(32).toString('hex');
			await h.query(
				`INSERT INTO "key" ("kid","kms","type","publicKeyHex","meta") VALUES ($1,'postgres','Ed25519',$1,'{}')`,
				[kid]
			);
			return { kid, kms: 'postgres', type: 'Ed25519', publicKeyHex: kid };
		});
		h.stubVeramo('createDid', async (_agent: unknown, _network: unknown, doc: any) => {
			await h.query(
				`INSERT INTO "identifier" ("did","provider","alias","saveDate","updateDate") VALUES ($1,'did:cheqd:testnet',$1,now(),now())`,
				[doc.id]
			);
			return { did: doc.id, provider: 'did:cheqd:testnet', keys: [], services: [] };
		});
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/did/create', {
			as: h.tenantB,
			body: { network: 'testnet', verificationMethodType: 'Ed25519VerificationKey2018', ...f.body },
			query: f.query,
			headers: f.headers,
		});
		expect(res.status).toBeLessThan(300);
		await expectVictimUntouched(before);
		const [row] = await h.query('SELECT "customerId" FROM "identifier" WHERE "did" = $1', [res.body.did]);
		expect(row.customerId).toBe(h.tenantB.customerId);
	});
});

describe('POST /account/create and POST /account/faucet', () => {
	it('[POST /account/create] acts on the caller’s account and leaves the named customer alone', async () => {
		h.stubVeramo('createKey', async () => {
			const kid = randomBytes(32).toString('hex');
			await h.query(
				`INSERT INTO "key" ("kid","kms","type","publicKeyHex","meta") VALUES ($1,'postgres','Ed25519',$1,'{}')`,
				[kid]
			);
			return { kid, kms: 'postgres', type: 'Ed25519', publicKeyHex: kid };
		});
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/account/create', {
			as: h.tenantB,
			body: { primaryEmail: 'victim@isolation.invalid', ...f.body },
			query: f.query,
			headers: f.headers,
		});
		// Provisioning the payment accounts needs a chain, so the request may fail late; isolation is what is asserted.
		await expectVictimUntouched(before);
		expectNoLeak(res, h.tenantA, { body: f.body, query: f.query, headers: f.headers });
	});

	it('[POST /account/faucet] charges the quota to the caller, never to the customerId named in the request', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		await h.request('POST', '/account/faucet', { as: h.tenantB, body: f.body, query: f.query, headers: f.headers });
		await expectVictimUntouched(before);
		const rows = await h.query('SELECT "customerId" FROM "faucetRequest" WHERE "customerId" = $1', [
			h.tenantA.customerId,
		]);
		expect(rows).toEqual([]);
	});

	it('[GET /account/idtoken] returns the caller’s own token material only', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('GET', '/account/idtoken', { as: h.tenantB, query: f.query, headers: f.headers });
		expect(res.status).toBeLessThan(500);
		expectNoLeak(res, h.tenantA, { query: f.query, headers: f.headers });
		await expectVictimUntouched(before);
	});

	it('[POST /account/bootstrap] refuses an unsigned webhook and creates nothing', async () => {
		const [{ count: customersBefore }] = await h.query('SELECT count(*)::int AS count FROM "customer"');
		const res = await h.request('POST', '/account/bootstrap', {
			body: {
				event: 'User.Created',
				user: { id: randomUUID(), primaryEmail: 'attacker@isolation.invalid', name: 'attacker' },
			},
		});
		expect(res.status).toBeGreaterThanOrEqual(400);
		const [{ count: customersAfter }] = await h.query('SELECT count(*)::int AS count FROM "customer"');
		expect(customersAfter).toBe(customersBefore);
	});
});

describe('providers', () => {
	it('[PUT /providers/:providerId/configuration] changes only the caller’s configuration', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('PUT', '/providers/dock/configuration', {
			as: h.tenantB,
			body: { apiEndpoint: 'http://provider.invalid/b', ...f.body },
			query: f.query,
			headers: f.headers,
		});
		expect(res.status).toBeLessThan(500);
		await expectVictimUntouched(before);
	});

	it('[POST /providers/:providerId/test] never uses another tenant’s provider secret', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/providers/dock/test', {
			as: h.tenantB,
			body: f.body,
			query: f.query,
			headers: f.headers,
		});
		expect(res.status).toBeLessThan(500);
		expectNoLeak(res, h.tenantA, { body: f.body });
		await expectVictimUntouched(before);
	});

	it('[POST /providers/:providerId/activate] a second activation is per tenant and leaves the other tenant alone', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		await h.request('POST', '/providers/creds/activate', {
			as: h.tenantB,
			body: f.body,
			query: f.query,
			headers: f.headers,
		});
		await expectVictimUntouched(before);
	});

	it('[POST /providers/:providerId/did/import] does not import into, or read from, another tenant', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('POST', '/providers/dock/did/import', {
			as: h.tenantB,
			body: { did: h.tenantA.did, ...f.body },
			query: f.query,
			headers: f.headers,
		});
		expectNoLeak(res, h.tenantA, { body: { did: h.tenantA.did, ...f.body } });
		await expectVictimUntouched(before);
	});

	it('[DELETE /providers/:providerId] removes only the caller’s configuration', async () => {
		const before = await h.snapshot(h.tenantA);
		const f = forged();
		const res = await h.request('DELETE', '/providers/dock', { as: h.tenantB, query: f.query, headers: f.headers });
		expect(res.status).toBeLessThan(500);
		await expectVictimUntouched(before);
		const rows = await h.query('SELECT 1 FROM "providerConfiguration" WHERE "customerId" = $1', [
			h.tenantA.customerId,
		]);
		expect(rows).toHaveLength(1);
	});

	it('[GET /providers] is the shared catalogue and carries no tenant configuration', async () => {
		const res = await h.request('GET', '/providers', { as: h.tenantB });
		expect(res.status).toBe(200);
		expectNoLeak(res, h.tenantA);
	});
});

describe('verification and public lookups', () => {
	it('[POST /credential/verify] verifies without exposing any tenant’s data', async () => {
		const res = await h.request('POST', '/credential/verify', {
			as: h.tenantB,
			body: { credential: 'eyJhbGciOiJFZERTQSJ9.e30.c2ln' },
		});
		expect(res.status).toBeLessThan(600);
		expectNoLeak(res, h.tenantA);
	});

	it('[POST /presentation/verify] verifies without exposing any tenant’s data', async () => {
		const res = await h.request('POST', '/presentation/verify', {
			as: h.tenantB,
			body: { presentation: 'eyJhbGciOiJFZERTQSJ9.e30.c2ln' },
		});
		expect(res.status).toBeLessThan(600);
		expectNoLeak(res, h.tenantA);
	});

	it('[POST /credential-status/check] only reads published status, writes nothing, and exposes no tenant rows', async () => {
		const before = await h.snapshot(h.tenantA);
		const res = await h.request('POST', '/credential-status/check', {
			as: h.tenantB,
			query: { listType: 'BitstringStatusList' },
			body: { did: h.tenantA.did, statusListName: h.tenantA.statusListName, index: 3 },
		});
		expect(res.status).toBeLessThan(600);
		expect(h.allWrites()).toEqual([]);
		expectNoLeak(res, h.tenantA, { did: h.tenantA.did, statusListName: h.tenantA.statusListName });
		await expectVictimUntouched(before);
	});

	it('[GET /credential-status/search] needs no credentials and reads no tenant rows', async () => {
		const res = await h.request('GET', '/credential-status/search', {
			query: { did: h.tenantA.did, statusListName: h.tenantA.statusListName, listType: 'BitstringStatusList' },
		});
		expect(res.status).toBeLessThan(600);
		expectNoLeak(res, h.tenantA, { did: h.tenantA.did, statusListName: h.tenantA.statusListName });
	});

	it('[GET /did/search/:did] needs no credentials and reads no tenant rows', async () => {
		const res = await h.request('GET', `/did/search/${encodeURIComponent(h.tenantA.did)}`);
		expect(res.status).toBeLessThan(600);
		expect(res.text).not.toContain(h.tenantA.customerId);
	});

	it('[GET /resource/search/:did] needs no credentials and reads no tenant rows', async () => {
		const res = await h.request('GET', `/resource/search/${encodeURIComponent(h.tenantA.did)}`, {
			query: { resourceName: h.tenantA.resourceName },
		});
		expect(res.status).toBeLessThan(600);
		expect(res.text).not.toContain(h.tenantA.customerId);
	});
});
