/**
 * Staging tier: the same isolation assertions, run black-box against a real deployment with two real accounts.
 *
 * Skipped unless all of these are set (never put real values in the repository; set them as CI secrets):
 *   STUDIO_STAGING_BASE_URL       e.g. https://studio-api-staging.example.net
 *   STUDIO_STAGING_API_KEY_A      API key of staging account A
 *   STUDIO_STAGING_API_KEY_B      API key of staging account B
 *
 * Read-only by default: account B tries to read account A's data and nothing is written. The mutation probes
 * (including the A-056 revoke/suspend/reinstate probe) run only when STUDIO_STAGING_ALLOW_MUTATION=1 and they target
 * disposable testnet data that account A owns:
 *   STUDIO_STAGING_A_DISPOSABLE_DID   a testnet DID owned by A that may be altered
 *   STUDIO_STAGING_A_CREDENTIAL       JSON of a testnet credential issued by that DID, which may be revoked
 * Each probe should be refused. If one succeeds, account A's data has been changed on staging: treat it as a finding.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import routeInventory from '../route-inventory.json' with { type: 'json' };

const env = process.env;
const BASE = env.STUDIO_STAGING_BASE_URL;
const KEY_A = env.STUDIO_STAGING_API_KEY_A;
const KEY_B = env.STUDIO_STAGING_API_KEY_B;
const configured = Boolean(BASE && KEY_A && KEY_B);
const mutate = env.STUDIO_STAGING_ALLOW_MUTATION === '1';
const DID_A = env.STUDIO_STAGING_A_DISPOSABLE_DID;
const CREDENTIAL_A = env.STUDIO_STAGING_A_CREDENTIAL;

type Res = { status: number; body: any; text: string };
async function call(
	method: string,
	path: string,
	opts: { key?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}
): Promise<Res> {
	const url = new URL(path, BASE);
	for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
	const headers: Record<string, string> = { ...(opts.headers ?? {}) };
	if (opts.key) headers['x-api-key'] = opts.key;
	if (opts.body !== undefined) headers['content-type'] = 'application/json';
	const res = await fetch(url, {
		method,
		headers,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
		redirect: 'manual',
	});
	const text = await res.text();
	let body: any = text;
	try {
		body = JSON.parse(text);
	} catch {
		// not JSON
	}
	return { status: res.status, body, text };
}

const suite = configured ? describe : describe.skip;

suite('staging tenant isolation (account B against account A)', () => {
	const a = { customerId: '', ids: new Set<string>(), before: '' };
	const b = { customerId: '' };

	/** Identifiers of account A that B must never see: everything A's own list routes reveal. */
	async function discoverA() {
		const mine = await call('GET', '/account', { key: KEY_A });
		a.customerId = mine.body?.customer?.customerId;
		const found = new Set<string>([a.customerId]);
		// Only identifiers that name something A owns. A subject DID that both accounts issued to is not A's.
		const owned = new Set([
			'did',
			'resourceId',
			'statusListId',
			'issuedCredentialId',
			'operationId',
			'kid',
			'customerId',
		]);
		const collect = (value: unknown, key = '') => {
			if (typeof value === 'string') {
				if (owned.has(key) && value.length >= 8) found.add(value);
			} else if (Array.isArray(value)) value.forEach((v) => collect(v, key));
			else if (value && typeof value === 'object') {
				for (const [k, v] of Object.entries(value)) collect(v, k);
			}
		};
		for (const path of [
			'/did/list',
			'/resource/list',
			'/credential-status/list',
			'/credentials/issued',
			'/event/list',
		]) {
			const res = await call('GET', path, { key: KEY_A });
			if (res.status === 200) collect(res.body);
		}
		a.ids = found;
		a.before = await stateOfA();
	}

	async function stateOfA() {
		const parts: unknown[] = [];
		for (const path of ['/did/list', '/resource/list', '/credential-status/list', '/credentials/issued']) {
			const res = await call('GET', path, { key: KEY_A });
			parts.push(res.body);
		}
		return JSON.stringify(parts);
	}

	const leaks = (res: Res, sent = '') => [...a.ids].filter((id) => res.text.includes(id) && !sent.includes(id));

	beforeAll(async () => {
		const mine = await call('GET', '/account', { key: KEY_B });
		b.customerId = mine.body?.customer?.customerId;
		expect(b.customerId).toBeTruthy();
		await discoverA();
		expect(a.customerId).toBeTruthy();
		expect(a.customerId).not.toBe(b.customerId);
	}, 60_000);

	afterAll(async () => {
		if (mutate) expect(await stateOfA()).toBe(a.before);
	});

	const listRoutes = [
		'/did/list',
		'/resource/list',
		'/credential-status/list',
		'/credentials/issued',
		'/event/list',
		'/account',
		'/admin/api-key/list',
		'/admin/organisation/get',
		'/credentials/offers',
		'/trust-registry/accreditation/list',
	];
	describe.each(listRoutes)('GET %s', (path) => {
		it.each(['no hint', 'query customerId', 'header customer-id'])(
			`[staging GET ${path}] returns none of A's data (%s)`,
			async (name) => {
				const query = name === 'query customerId' ? { customerId: a.customerId } : undefined;
				const headers = name === 'header customer-id' ? { 'customer-id': a.customerId } : undefined;
				const res = await call('GET', path, { key: KEY_B, query, headers });
				expect(res.status).toBeLessThan(500);
				expect(leaks(res, JSON.stringify({ query, headers }))).toEqual([]);
			}
		);
	});

	it('[staging identity] B’s key with id-token and bearer headers naming A is served as B', async () => {
		const res = await call('GET', '/account', {
			key: KEY_B,
			headers: { 'customer-id': a.customerId, 'id-token': 'x.y.z', authorization: 'Bearer x.y.z' },
		});
		expect(res.body?.customer?.customerId).toBe(b.customerId);
	});

	it('[staging identity] an invalid API key is refused', async () => {
		const res = await call('GET', '/account', { key: 'caas_not_a_real_key' });
		expect(res.status).toBe(401);
	});

	it('[staging identity] a made-up bearer with customer-id naming A is refused', async () => {
		const res = await call('GET', '/account', {
			headers: { authorization: 'Bearer x.y.z', 'customer-id': a.customerId },
		});
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.body?.customer?.customerId).toBeUndefined();
	});

	describe('reads of one resource by id', () => {
		it("[staging GET /credential-status/list/:statusListId] A's status lists are not readable by B", async () => {
			const list = await call('GET', '/credential-status/list', { key: KEY_A });
			for (const record of (list.body?.records ?? []).slice(0, 5)) {
				const res = await call('GET', `/credential-status/list/${record.statusListId}`, { key: KEY_B });
				expect(res.status).toBeGreaterThanOrEqual(400);
				expect(leaks(res, record.statusListId)).toEqual([]);
			}
		});
		it("[staging GET /credentials/issued/:id] A's issued credentials are not readable by B", async () => {
			const list = await call('GET', '/credentials/issued', { key: KEY_A });
			for (const item of (list.body?.credentials ?? []).slice(0, 5)) {
				const res = await call('GET', `/credentials/issued/${item.issuedCredentialId}`, { key: KEY_B });
				expect(res.status).toBeGreaterThanOrEqual(400);
			}
		});
		it("[staging POST /did/export/:did] A's DIDs and keys cannot be exported by B", async () => {
			const list = await call('GET', '/did/list', { key: KEY_A });
			for (const item of (list.body?.dids ?? []).slice(0, 3)) {
				const res = await call('POST', `/did/export/${encodeURIComponent(item.did)}`, { key: KEY_B, body: {} });
				expect(res.status).toBeGreaterThanOrEqual(400);
				expect(res.text).not.toMatch(/privateKey/i);
			}
		});
	});

	const probe = mutate && DID_A ? describe : describe.skip;
	probe('mutation probes against A’s disposable data (STUDIO_STAGING_ALLOW_MUTATION=1)', () => {
		it('[staging POST /did/update] B cannot update A’s DID', async () => {
			const res = await call('POST', '/did/update', {
				key: KEY_B,
				body: {
					did: DID_A,
					service: [
						{ id: `${DID_A}#probe`, type: 'LinkedDomains', serviceEndpoint: ['https://example.com'] },
					],
				},
			});
			expect(res.status).toBeGreaterThanOrEqual(400);
		});
		it('[staging POST /resource/create/:did] B cannot publish a resource under A’s DID', async () => {
			const res = await call('POST', `/resource/create/${encodeURIComponent(DID_A as string)}`, {
				key: KEY_B,
				body: { data: Buffer.from('{}').toString('base64'), encoding: 'base64', name: 'probe', type: 'Probe' },
			});
			expect(res.status).toBeGreaterThanOrEqual(400);
		});
		it('[staging POST /presentation/create] B cannot create a presentation held by A’s DID', async () => {
			const res = await call('POST', '/presentation/create', {
				key: KEY_B,
				body: { credentials: [JSON.parse(CREDENTIAL_A ?? '{}')], holderDid: DID_A },
			});
			expect(res.status).toBeGreaterThanOrEqual(400);
		});
		it.each(['revoke', 'suspend', 'reinstate'])(
			'[staging POST /credential/%s] A-056 probe: B cannot change A’s credential status',
			async (action) => {
				expect(CREDENTIAL_A).toBeTruthy();
				const res = await call('POST', `/credential/${action}`, {
					key: KEY_B,
					query: { listType: 'BitstringStatusList', publish: 'true' },
					body: { credential: JSON.parse(CREDENTIAL_A as string) },
				});
				expect(res.status).toBeGreaterThanOrEqual(400);
			}
		);
		it('[staging POST /did/deactivate/:did] B cannot deactivate A’s DID', async () => {
			const res = await call('POST', `/did/deactivate/${encodeURIComponent(DID_A as string)}`, {
				key: KEY_B,
				body: {},
			});
			expect(res.status).toBeGreaterThanOrEqual(400);
		});
	});

	describe('no credentials', () => {
		const refused = (
			routeInventory.routes as Array<{ method: string; path: string; sample: string; unauthenticated: string }>
		).filter((r) => r.unauthenticated === 'must-refuse' && r.method === 'GET');
		it.each(refused.map((r) => [`${r.method} ${r.path}`, r.sample] as const))(
			'[staging unauth %s] is refused',
			async (_key, sample) => {
				const res = await call('GET', sample);
				expect(res.status).toBeGreaterThanOrEqual(400);
			}
		);
	});
});
