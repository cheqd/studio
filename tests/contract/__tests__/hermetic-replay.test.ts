/**
 * Hermetic end-to-end test of the recorder and replayer machinery against stub servers.
 * No network beyond 127.0.0.1, no testnet, no credentials. The stubs are NOT Studio: they only
 * prove that recording, normalisation and diffing behave as documented.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeTarget, readEnv } from '../lib/config';
import { compare, loadFixtures, runScenario, toFixture, writeFixture, type RunConfig, type Step } from '../lib/engine';

type Variant = 'baseline' | 'field-removed' | 'field-added' | 'status-changed' | 'value-changed' | 'type-changed';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const hex = (n: number, seed: number) => seed.toString(16).padStart(2, '0').repeat(n).slice(0, n);
const uuid = (seed: number) => `${hex(8, seed)}-${hex(4, seed)}-4${hex(3, seed)}-8${hex(3, seed)}-${hex(12, seed)}`;

/** A stub whose ids, times and signatures depend on `seed`, so every instance "differs" like a real run. */
function startStub(
	seed: number,
	variant: Variant = 'baseline'
): Promise<{ server: Server; url: string; seen: string[] }> {
	const seen: string[] = [];
	const server = createServer((req, res) => {
		let raw = '';
		req.on('data', (c) => (raw += c));
		req.on('end', () => {
			seen.push(
				`${req.method} ${req.url} key=${req.headers['x-api-key'] ?? '-'} engine=${req.headers['x-engine'] ?? '-'}`
			);
			const send = (status: number, body: unknown, type = 'application/json; charset=utf-8') => {
				res.writeHead(status, { 'content-type': type, 'x-request-id': uuid(seed) });
				res.end(typeof body === 'string' ? body : JSON.stringify(body));
			};
			const url = new URL(req.url ?? '/', 'http://stub');
			if (req.method === 'GET' && url.pathname === '/account') {
				if (!req.headers['x-api-key']) return send(401, { error: 'Unauthorized' });
				const body: Record<string, unknown> = {
					customerId: uuid(seed),
					createdAt: `2026-0${(seed % 9) + 1}-01T00:00:00.000Z`,
					paymentAccount: { address: 'cheqd1' + hex(38, seed).replace(/[a-f]/g, 'q') },
				};
				if (variant === 'field-removed') delete body.customerId;
				if (variant === 'field-added') body.newField = true;
				if (variant === 'value-changed') body.paymentAccount = { address: 'something-else' };
				if (variant === 'type-changed') body.customerId = 5;
				return send(variant === 'status-changed' ? 500 : 200, body);
			}
			if (req.method === 'POST' && url.pathname === '/did/create') {
				const did = `did:cheqd:testnet:${uuid(seed)}`;
				return send(200, {
					did,
					controllerKeyId: hex(64, seed),
					didDocument: { id: did },
					txHash: hex(64, seed + 1).toUpperCase(),
				});
			}
			if (req.method === 'POST' && url.pathname === '/credential/issue') {
				const body = JSON.parse(raw || '{}') as { issuerDid: string };
				const jwt = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64({ iss: body.issuerDid, iat: 1700000000 + seed, jti: uuid(seed) })}.${b64('sig' + seed)}`;
				return send(200, {
					proof: { type: 'JwtProof2020', jwt },
					issuanceDate: `2026-11-1${seed % 9}T10:00:00Z`,
				});
			}
			if (req.method === 'GET' && url.pathname === '/plain') return send(200, 'hello', 'text/plain');
			return send(404, { error: 'not found' });
		});
	});
	return new Promise((resolve) =>
		server.listen(0, '127.0.0.1', () =>
			resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen })
		)
	);
}

const steps: Step[] = [
	{
		id: 'account-get',
		description: 'account',
		routeId: 'GET /account',
		method: 'GET',
		path: '/account',
		auth: 'api-key',
		tier: 2,
		effect: 'read-only',
	},
	{
		id: 'account-get-no-key',
		description: 'no key',
		routeId: 'GET /account',
		method: 'GET',
		path: '/account',
		auth: 'none',
		tier: 2,
		effect: 'read-only',
	},
	{
		id: 'plain',
		description: 'text body',
		routeId: 'GET /plain',
		method: 'GET',
		path: '/plain',
		auth: 'none',
		tier: 2,
		effect: 'read-only',
	},
	{
		id: 'did-create',
		description: 'create',
		routeId: 'POST /did/create',
		method: 'POST',
		path: '/did/create',
		body: { network: '{network}' },
		auth: 'api-key',
		tier: 2,
		effect: 'ledger-fee',
		capture: { did: 'did' },
	},
	{
		id: 'issue',
		description: 'issue',
		routeId: 'POST /credential/issue',
		method: 'POST',
		path: '/credential/issue',
		body: { issuerDid: '{did}' },
		auth: 'api-key',
		tier: 2,
		effect: 'state-database',
		requires: ['did'],
	},
];

const baseConfig = (url: string, over: Partial<RunConfig> = {}): RunConfig => ({
	baseUrl: url,
	apiKey: 'test-key',
	vars: { network: 'testnet' },
	allow: new Set(['read-only', 'state-database', 'ledger-fee']),
	...over,
});

let dir: string;
beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'contract-hermetic-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function recordFrom(seed: number, fixturesDir: string): Promise<void> {
	const stub = await startStub(seed);
	try {
		const results = await runScenario(steps, baseConfig(stub.url));
		for (const r of results)
			writeFixture(fixturesDir, toFixture(r, { engine: 'veramo', gitRef: 'test', now: new Date(0) }));
	} finally {
		stub.server.close();
	}
}

async function replayAgainst(
	seed: number,
	variant: Variant,
	fixturesDir: string,
	mode: 'strict' | 'additive' = 'strict',
	over: Partial<RunConfig> = {}
) {
	const stub = await startStub(seed, variant);
	try {
		const results = await runScenario(steps, baseConfig(stub.url, over));
		return { comparisons: compare(results, loadFixtures(fixturesDir), mode), seen: stub.seen };
	} finally {
		stub.server.close();
	}
}

describe('record then replay against stubs', () => {
	let fixtures: string;
	beforeAll(async () => {
		fixtures = join(dir, 'golden');
		await recordFrom(1, fixtures);
	});

	it('writes one fixture per step, with no raw ids, hashes, timestamps or signatures', () => {
		expect(readdirSync(fixtures).sort()).toEqual([
			'account-get-no-key.json',
			'account-get.json',
			'did-create.json',
			'issue.json',
			'plain.json',
		]);
		const all = readdirSync(fixtures)
			.map((f) => readFileSync(join(fixtures, f), 'utf-8'))
			.join('\n');
		expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4/); // no UUIDs
		expect(all).not.toMatch(/[0-9A-Fa-f]{64}/); // no hashes
		expect(all).not.toMatch(/2026-\d\d-\d\dT/); // no timestamps
		expect(all).not.toContain('test-key');
		expect(all).toContain('<uuid:1>');
	});

	it('passes against a different instance whose ids, times and signatures all differ', async () => {
		const { comparisons } = await replayAgainst(7, 'baseline', fixtures);
		expect(comparisons.map((c) => `${c.stepId}:${c.outcome}`)).toEqual([
			'account-get:pass',
			'account-get-no-key:pass',
			'plain:pass',
			'did-create:pass',
			'issue:pass',
		]);
	});

	const cases: [Variant, string, string][] = [
		['field-removed', 'missing', '$body.customerId'],
		['type-changed', 'type', '$body.customerId'],
		['value-changed', 'changed', '$body.paymentAccount.address'],
	];
	it.each(cases)('fails when the response has a %s difference', async (variant, kind, path) => {
		const { comparisons } = await replayAgainst(3, variant, fixtures);
		const failed = comparisons.find((c) => c.stepId === 'account-get');
		expect(failed?.outcome).toBe('fail');
		expect(failed?.differences).toEqual(expect.arrayContaining([expect.objectContaining({ kind, path })]));
	});

	it('fails on a changed status code', async () => {
		const { comparisons } = await replayAgainst(3, 'status-changed', fixtures);
		const failed = comparisons.find((c) => c.stepId === 'account-get');
		expect(failed?.outcome).toBe('fail');
		expect(failed?.differences[0]).toMatchObject({ path: '$status', expected: 200, actual: 500 });
	});

	it('fails on an added field in strict mode and passes in additive mode', async () => {
		const strict = await replayAgainst(3, 'field-added', fixtures, 'strict');
		expect(strict.comparisons.find((c) => c.stepId === 'account-get')?.outcome).toBe('fail');
		const additive = await replayAgainst(3, 'field-added', fixtures, 'additive');
		expect(additive.comparisons.find((c) => c.stepId === 'account-get')?.outcome).toBe('pass');
	});

	it('sends the engine header only when configured, and the API key only on api-key steps', async () => {
		const { seen } = await replayAgainst(2, 'baseline', fixtures, 'strict', {
			engine: 'credo',
			engineHeader: 'x-engine',
		});
		expect(seen[0]).toBe('GET /account key=test-key engine=credo');
		expect(seen[1]).toBe('GET /account key=- engine=credo');
		const plain = await replayAgainst(2, 'baseline', fixtures);
		expect(plain.seen[0]).toContain('engine=-');
	});

	it('flags scenario drift when a step request changed since recording', async () => {
		const stub = await startStub(5);
		try {
			const edited = steps.map((s) => (s.id === 'did-create' ? { ...s, body: { network: 'mainnet' } } : s));
			const comparisons = compare(await runScenario(edited, baseConfig(stub.url)), loadFixtures(fixtures));
			const c = comparisons.find((x) => x.stepId === 'did-create');
			expect(c?.outcome).toBe('fail');
			expect(c?.differences[0].path).toContain('[scenario-drift]');
		} finally {
			stub.server.close();
		}
	});

	it('reports a step without a fixture rather than passing it silently', async () => {
		const empty = join(dir, 'empty');
		const { comparisons } = await replayAgainst(2, 'baseline', empty);
		expect(comparisons.every((c) => c.outcome === 'no-fixture')).toBe(true);
	});
});

describe('safety gates', () => {
	it('skips ledger-fee and mutating steps unless allowed, and steps whose variables are missing', async () => {
		const stub = await startStub(1);
		try {
			const results = await runScenario(steps, baseConfig(stub.url, { allow: new Set(['read-only']) }));
			const byId = Object.fromEntries(results.map((r) => [r.step.id, r]));
			expect(byId['did-create'].status).toBe('skipped');
			expect(byId['did-create'].reason).toContain('ledger-fee');
			expect(byId['issue'].status).toBe('skipped');
			expect(stub.seen.some((s) => s.includes('/did/create'))).toBe(false);
		} finally {
			stub.server.close();
		}
	});

	it('skips api-key steps without a key and feature-gated steps without the feature', async () => {
		const stub = await startStub(1);
		try {
			const gated: Step = { ...steps[2], id: 'stripe-step', feature: 'stripe' };
			const results = await runScenario([steps[0], gated], baseConfig(stub.url, { apiKey: undefined }));
			expect(results.map((r) => r.reason)).toEqual(['no API key', "feature 'stripe' not enabled"]);
		} finally {
			stub.server.close();
		}
	});

	it('refuses production hosts and non-testnet networks', () => {
		const cfg = readEnv({ CONTRACT_BASE_URL: 'https://studio-api.cheqd.net' }, dir);
		expect(() => assertSafeTarget(cfg)).toThrow(/Refusing/);
		expect(() =>
			assertSafeTarget(readEnv({ CONTRACT_BASE_URL: 'http://localhost:3000', CONTRACT_NETWORK: 'mainnet' }, dir))
		).toThrow(/testnet/);
		expect(() => assertSafeTarget(readEnv({}, dir))).toThrow(/CONTRACT_BASE_URL/);
		expect(() => assertSafeTarget(readEnv({ CONTRACT_BASE_URL: 'http://localhost:3000' }, dir))).not.toThrow();
	});

	it('maps CONTRACT_ALLOW_* flags to effects and defaults ENGINE to veramo', () => {
		const none = readEnv({}, dir);
		expect([...none.allow]).toEqual(['read-only']);
		expect(none.engine).toBe('veramo');
		const all = readEnv(
			{
				CONTRACT_ALLOW_MUTATIONS: 'true',
				CONTRACT_ALLOW_LEDGER_WRITES: 'true',
				CONTRACT_ALLOW_FAUCET: 'true',
				ENGINE: 'credo',
			},
			dir
		);
		expect([...all.allow].sort()).toEqual(['faucet', 'ledger-fee', 'read-only', 'state-database']);
		expect(all.engine).toBe('credo');
	});
});
