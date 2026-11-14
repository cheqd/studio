import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AgentController } from '../../../src/controllers/api/agent.js';
import { AgentService } from '../../../src/services/agent/agent-service.js';
import { LedgerUnavailableError } from '../../../src/services/identity/ledger-lock.js';
import { IdempotencyService } from '../../../src/services/idempotency/idempotency.js';
import { customerA, customerB, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';

const V = AgentController;
const RESOLVER = 'https://resolver.test/1.0/identifiers/';
const ZERO = '00000000-0000-4000-8000-000000000000';

let world: World;
let store: FakeStore;
let agents: AgentService;
let controller: AgentController;
let now = new Date('2026-11-20T10:00:00Z');

beforeEach(() => {
	jest.spyOn(console, 'debug').mockImplementation(() => undefined);
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	now = new Date('2026-11-20T10:00:00Z');
	const fresh = newWorld();
	world = fresh.world;
	store = fresh.store;
	agents = new AgentService({
		store,
		engineFor: fresh.engineFor,
		statusListSize: 64,
		now: () => now,
		resolverUrl: () => RESOLVER,
		kyaOsDelegationsEnabled: () => true,
	});
	controller = new AgentController(() => ({ agents }));
});

interface Call {
	handler: keyof AgentController;
	validators?: Array<{ run: (req: Request) => Promise<unknown> }>;
	body?: unknown;
	params?: Record<string, string>;
	query?: Record<string, string>;
	customer?: unknown;
	locals?: Record<string, unknown>;
	headers?: Record<string, string>;
	route?: string;
	controllerOverride?: AgentController;
}

async function call(spec: Call) {
	const request = {
		method: 'X',
		body: spec.body ?? {},
		params: spec.params ?? {},
		query: spec.query ?? {},
		headers: spec.headers ?? {},
		route: { path: spec.route ?? '/x' },
	} as unknown as Request;
	for (const validator of spec.validators ?? []) await validator.run(request);
	const out = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
	const response = { locals: { customer: spec.customer, ...(spec.locals ?? {}) } } as unknown as Response;
	response.status = ((code: number) => ((out.statusCode = code), response)) as never;
	response.json = ((body: unknown) => ((out.body = body), response)) as never;
	response.setHeader = ((name: string, value: string) => ((out.headers[name] = value), response)) as never;
	await ((spec.controllerOverride ?? controller)[spec.handler] as (req: Request, res: Response) => Promise<unknown>)(
		request,
		response
	);
	return { status: out.statusCode, body: out.body as Record<string, any>, headers: out.headers };
}

async function newAgent(customer = customerA, extra: Record<string, unknown> = {}) {
	const organisation = await seedOrganisationDid(world, customer);
	const agent = await agents.register(customer, {
		name: 'bot',
		network: 'testnet',
		actsForDid: organisation,
		...extra,
	});
	return { agent, organisation, params: { agentId: agent.agentId } };
}

const grant = async (agentId: string, input: Record<string, unknown>, customer = customerA) =>
	agents.grantAuthority(customer, agentId, input as never);

const NOT_FOUND_BODY = { error: 'Agent not found', code: 'not_found' };

describe('GET /agents with q, authoritySummary and capabilities', () => {
	it('filters by name, description and DID, case-insensitively, in the query, with total after filtering', async () => {
		const a = await newAgent(customerA, { name: 'Invoice Bot', description: 'pays suppliers' });
		await newAgent(customerA, { name: 'Weather' });
		await newAgent(customerB, { name: 'Invoice Bot' });
		const list = (q?: string, extra: Record<string, string> = {}) =>
			call({
				handler: 'list',
				validators: V.listValidator,
				query: { ...(q ? { q } : {}), ...extra },
				customer: customerA,
			});

		expect((await list()).body.total).toBe(2);
		const byName = await list('invoice');
		expect(byName.body.total).toBe(1);
		expect(byName.body.agents.map((x: any) => x.name)).toEqual(['Invoice Bot']);
		expect((await list('SUPPLIERS')).body.total).toBe(1);
		expect((await list(a.agent.did.slice(-12).toUpperCase())).body.agents[0].agentId).toBe(a.agent.agentId);
		const none = await list('zzz');
		expect(none.body).toEqual({ total: 0, agents: [] });
		// Filtered before paging: page 2 of a one-row result is empty but the total is still 1
		const paged = await list('invoice', { limit: '1', page: '2' });
		expect(paged.body.total).toBe(1);
		expect(paged.body.agents).toEqual([]);
		// The other customer's Invoice Bot is never matched
		expect(
			store.calls.filter((c) => c.method === 'listAgents').every((c) => c.customerId === customerA.customerId)
		).toBe(true);
	});

	it('rejects a q longer than 200 characters', async () => {
		const result = await call({
			handler: 'list',
			validators: V.listValidator,
			query: { q: 'x'.repeat(201) },
			customer: customerA,
		});
		expect(result.status).toBe(400);
	});

	it('adds authoritySummary (active grants only) and capabilities to each item', async () => {
		const { agent, organisation, params } = await newAgent();
		const idle = await newAgent(customerA, { name: 'idle' });
		await grant(agent.agentId, { grantType: 'acts-for' });
		await grant(agent.agentId, { grantType: 'tool-scope', tools: ['a'] });
		const revoked = await grant(agent.agentId, { grantType: 'tool-scope', tools: ['b'] });
		await agents.revokeAuthority(customerA, agent.agentId, revoked.grant.id);
		await grant(agent.agentId, { grantType: 'tool-scope', tools: ['c'], expiresAt: '2026-11-21T10:00:00Z' });
		await grant(agent.agentId, { grantType: 'delegation', scopes: ['x'] });
		now = new Date('2026-11-22T10:00:00Z'); // the third tool-scope grant has now expired
		void params;

		const list = await call({ handler: 'list', validators: V.listValidator, customer: customerA });
		const item = list.body.agents.find((x: any) => x.agentId === agent.agentId);
		expect(item.authoritySummary).toEqual({
			actsFor: organisation,
			grantCounts: { actsFor: 1, mandate: 0, delegation: 1, toolScope: 1 },
		});
		expect(item.capabilities).toEqual({ a2a: false, ap2: false, kyaOs: false, mcp: false });
		const empty = list.body.agents.find((x: any) => x.agentId === idle.agent.agentId);
		expect(empty.authoritySummary).toEqual({
			actsFor: null,
			grantCounts: { actsFor: 0, mandate: 0, delegation: 0, toolScope: 0 },
		});
	});
});

describe('authoritySummary and a suspended agent', () => {
	it('counts no grants of a suspended agent, in the list and in the detail, and again after reactivation', async () => {
		const { agent, params } = await newAgent();
		await grant(agent.agentId, { grantType: 'acts-for' });
		await grant(agent.agentId, { grantType: 'tool-scope', tools: ['a'] });
		await agents.update(customerA, agent.agentId, { status: 'suspended' });

		const none = { actsFor: null, grantCounts: { actsFor: 0, mandate: 0, delegation: 0, toolScope: 0 } };
		const list = await call({ handler: 'list', validators: V.listValidator, customer: customerA });
		expect(list.body.agents.find((x: any) => x.agentId === agent.agentId).authoritySummary).toEqual(none);
		const detail = await call({ handler: 'get', validators: V.idValidator, params, customer: customerA });
		expect(detail.body.authoritySummary).toEqual(none);

		await agents.update(customerA, agent.agentId, { status: 'active' });
		const back = await call({ handler: 'get', validators: V.idValidator, params, customer: customerA });
		expect(back.body.authoritySummary.grantCounts).toMatchObject({ actsFor: 1, toolScope: 1 });
	});
});

describe('GET /agents/{id}', () => {
	it('returns capabilities, authoritySummary and a null cardUrl while no card is published', async () => {
		const { params } = await newAgent();
		const result = await call({ handler: 'get', validators: V.idValidator, params, customer: customerA });
		expect(result.status).toBe(200);
		expect(result.body.cardUrl).toBeNull();
		expect(result.body.capabilities).toEqual({ a2a: false, ap2: false, kyaOs: false, mcp: false });
		expect(result.body.authoritySummary.grantCounts).toEqual({
			actsFor: 0,
			mandate: 0,
			delegation: 0,
			toolScope: 0,
		});
		expect(result.body).not.toHaveProperty('customerId');
		expect(result.body).not.toHaveProperty('useCase');
	});

	it('gives the URL of the newest published card, and ignores an unpublished one', async () => {
		const { agent, params } = await newAgent();
		const card = { endpoint: 'https://agent.example/a2a' };
		const published = await agents.createCard(customerA, agent.agentId, { card, publish: true });
		await agents.createCard(customerA, agent.agentId, { card });
		const result = await call({ handler: 'get', validators: V.idValidator, params, customer: customerA });
		expect(result.body.cardUrl).toBe(`${RESOLVER}${agent.did}/resources/${published.resourceId}`);
	});

	it('is 404 with the same body for another customer agent and for an unknown agent', async () => {
		const { params } = await newAgent(customerB);
		const other = await call({ handler: 'get', validators: V.idValidator, params, customer: customerA });
		const unknown = await call({
			handler: 'get',
			validators: V.idValidator,
			params: { agentId: ZERO },
			customer: customerA,
		});
		expect(other.status).toBe(404);
		expect(other.body).toEqual(unknown.body);
		expect(other.body).toEqual(NOT_FOUND_BODY);
	});
});

describe('capabilities and useCase', () => {
	it('stores capabilities and useCase on register, and returns capabilities but not useCase', async () => {
		const result = await call({
			handler: 'register',
			validators: V.registerValidator,
			body: { name: 'x', capabilities: { a2a: true, mcp: true }, useCase: 'support triage' },
			customer: customerA,
		});
		expect(result.status).toBe(201);
		expect(result.body.capabilities).toEqual({ a2a: true, ap2: false, kyaOs: false, mcp: true });
		expect(result.body).not.toHaveProperty('useCase');
		expect(store.agents.get(result.body.agentId)?.useCase).toBe('support triage');
	});

	it.each([
		['a useCase over 64 characters', { name: 'x', useCase: 'u'.repeat(65) }],
		['capabilities that is not an object', { name: 'x', capabilities: true }],
		['an unknown capability', { name: 'x', capabilities: { blockchain: true } }],
		['a non-boolean capability', { name: 'x', capabilities: { a2a: 'yes' } }],
	])('answers 400 for %s', async (_label, body) => {
		const result = await call({ handler: 'register', validators: V.registerValidator, body, customer: customerA });
		expect(result.status).toBe(400);
	});

	it('updates capabilities with PATCH, merging over what is there', async () => {
		const { params } = await newAgent(customerA, { capabilities: { a2a: true } });
		const result = await call({
			handler: 'update',
			validators: V.updateValidator,
			params,
			body: { capabilities: { ap2: true } },
			customer: customerA,
		});
		expect(result.status).toBe(200);
		expect(result.body.capabilities).toEqual({ a2a: true, ap2: true, kyaOs: false, mcp: false });
		const off = await call({
			handler: 'update',
			validators: V.updateValidator,
			params,
			body: { capabilities: { a2a: false } },
			customer: customerA,
		});
		expect(off.body.capabilities.a2a).toBe(false);
	});

	it('rejects bad capabilities on PATCH, and is 404 for another customer agent', async () => {
		const { params } = await newAgent(customerA);
		const bad = await call({
			handler: 'update',
			validators: V.updateValidator,
			params,
			body: { capabilities: { kyaOs: 1 } },
			customer: customerA,
		});
		expect(bad.status).toBe(400);
		const other = await call({
			handler: 'update',
			validators: V.updateValidator,
			params,
			body: { capabilities: { a2a: true } },
			customer: customerB,
		});
		expect(other.status).toBe(404);
		expect(store.agents.get(params.agentId)?.capabilities.a2a).toBe(false);
	});
});

describe('GET /agents/{id}/authority: summary, expiry and status', () => {
	it('adds a server-built summary to every grant, and shows suspended while the agent is suspended', async () => {
		const { agent, organisation, params } = await newAgent();
		await grant(agent.agentId, { grantType: 'acts-for' });
		await grant(agent.agentId, { grantType: 'tool-scope', tools: ['search', 'fetch'] });
		await grant(agent.agentId, {
			grantType: 'mandate',
			mandate: {
				type: 'payment',
				constraints: [
					{ type: 'payment.amount_range', currency: 'USD', max: 5000 },
					{ type: 'payment.agent_recurrence', frequency: 'WEEKLY' },
					{ type: 'payment.allowed_payees', allowed: [{ name: 'supplies' }] },
				],
			},
		});
		await grant(agent.agentId, { grantType: 'delegation', scopes: ['x'] });
		const listed = await call({ handler: 'listAuthority', validators: V.idValidator, params, customer: customerA });
		const summaries = Object.fromEntries(listed.body.grants.map((g: any) => [g.grantType, g.summary]));
		expect(summaries).toEqual({
			'acts-for': `Acts for ${organisation}`,
			'tool-scope': 'Tools: search, fetch',
			mandate: 'Up to 50 USD per week, supplies',
			delegation: 'Delegation (KYA-OS), depth 1',
		});
		expect(listed.body.grants.every((g: any) => g.status === 'active')).toBe(true);

		await agents.update(customerA, agent.agentId, { status: 'suspended' });
		const suspended = await call({
			handler: 'listAuthority',
			validators: V.idValidator,
			params,
			customer: customerA,
		});
		expect(suspended.body.grants.every((g: any) => g.status === 'suspended')).toBe(true);
		expect(JSON.stringify(suspended.body)).not.toMatch(/eyJ|credential|statusList/i);
	});
});

describe('GET /agents/{id}/keys', () => {
	it('lists both keys of a new agent with the contract shape, and no private material', async () => {
		const { agent, params } = await newAgent();
		const result = await call({ handler: 'listKeys', validators: V.idValidator, params, customer: customerA });
		expect(result.status).toBe(200);
		expect(result.body.keys).toHaveLength(2);
		for (const key of result.body.keys) {
			expect(Object.keys(key).sort()).toEqual(
				[
					'algorithm',
					'createdAt',
					'keyId',
					'publicKeyMultibase',
					'rotatedAt',
					'status',
					'type',
					'usedBy',
				].sort()
			);
			expect(key.keyId.startsWith(agent.did)).toBe(true);
			expect(key.status).toBe('active');
		}
		expect(result.body.keys.map((k: any) => [k.type, k.algorithm])).toEqual([
			['P-256', 'ES256'],
			['Ed25519', 'EdDSA'],
		]);
		expect(result.body.keys[0].usedBy).toEqual(['did', 'a2a', 'ap2']);
		expect(JSON.stringify(result.body)).not.toMatch(/privateKey|"d":|secret/i);
	});

	it('is 404 for another customer agent, with the not-found body', async () => {
		const { params } = await newAgent(customerB);
		const result = await call({ handler: 'listKeys', validators: V.idValidator, params, customer: customerA });
		expect(result.status).toBe(404);
		expect(result.body).toEqual(NOT_FOUND_BODY);
	});
});

describe('POST /agents/{id}/keys/rotate', () => {
	const rotate = (params: Record<string, string>, body: unknown, extra: Partial<Call> = {}) =>
		call({
			handler: 'rotateKey',
			validators: V.rotateKeyValidator,
			params,
			body,
			customer: customerA,
			route: '/agents/:agentId/keys/rotate',
			...extra,
		});

	it.each([
		['no keyId', { confirm: true }],
		['no confirm', { keyId: '#key-1' }],
		['confirm false', { keyId: '#key-1', confirm: false }],
		['confirm as a string', { keyId: '#key-1', confirm: 'true' }],
	])('answers 400 for %s and writes nothing', async (_label, body) => {
		const { params } = await newAgent();
		const result = await rotate(params, body);
		expect(result.status).toBe(400);
		expect(world.didUpdates).toHaveLength(0);
	});

	it('is 404 for another customer agent, and for an unknown key', async () => {
		const { agent: theirs, params: theirParams } = await newAgent(customerB);
		const other = await rotate(theirParams, { keyId: `${theirs.did}#key-1`, confirm: true });
		expect(other.status).toBe(404);
		expect(other.body).toEqual(NOT_FOUND_BODY);

		const { agent, params } = await newAgent();
		const unknown = await rotate(params, { keyId: `${agent.did}#key-9`, confirm: true });
		expect(unknown.status).toBe(404);
		expect(world.didUpdates).toHaveLength(0);
	});

	it('rotates the P-256 key: new key, DID updated with old key kept, old key rotated, event and audit written', async () => {
		const { agent, params } = await newAgent();
		const before = await agents.listKeys(customerA, agent.agentId);
		const oldKey = before.find((k) => k.type === 'P-256')!;
		const result = await rotate(params, { keyId: oldKey.keyId, confirm: true });
		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			oldKeyId: oldKey.keyId,
			newKeyId: `${agent.did}#key-3`,
			didUpdate: { txHash: null },
		});
		expect(world.didUpdates).toHaveLength(1);
		expect(world.didUpdates[0]!.owner).toBe(customerA.customerId);

		const keys = (await call({ handler: 'listKeys', validators: V.idValidator, params, customer: customerA })).body
			.keys;
		const byId = Object.fromEntries(keys.map((k: any) => [k.keyId, k]));
		expect(byId[oldKey.keyId]).toMatchObject({ status: 'rotated', usedBy: [] });
		expect(byId[oldKey.keyId].rotatedAt).toBeTruthy();
		expect(byId[`${agent.did}#key-3`]).toMatchObject({
			status: 'active',
			type: 'P-256',
			usedBy: ['did', 'a2a', 'ap2'],
		});
		expect(keys.find((k: any) => k.type === 'Ed25519').status).toBe('active');

		expect(store.events.at(-1)).toMatchObject({
			type: 'key-rotated',
			actor: 'owner',
			detail: { oldKeyId: oldKey.keyId, newKeyId: `${agent.did}#key-3` },
		});
		expect(store.audit).toHaveLength(1);
		expect(store.audit[0]).toMatchObject({ customerId: customerA.customerId, action: 'agent.key.rotated' });
		expect(JSON.stringify(store.audit)).not.toMatch(/@/);
	});

	it('accepts the fragment forms of keyId', async () => {
		const { agent, params } = await newAgent();
		const result = await rotate(params, { keyId: 'key-2', confirm: true });
		expect(result.status).toBe(200);
		expect(result.body.oldKeyId).toBe(`${agent.did}#key-2`);
	});

	it('signs with the new key afterwards, never the rotated one', async () => {
		const { agent, params } = await newAgent();
		await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		await agents.createCard(customerA, agent.agentId, { card: { endpoint: 'https://agent.example/a2a' } });
		expect(world.signCalls.at(-1)?.kid).toBe(`${agent.did}#key-3`);
	});

	it('answers 409 for a key that is already rotated, and writes nothing more', async () => {
		const { agent, params } = await newAgent();
		await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		const again = await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		expect(again.status).toBe(409);
		expect(again.body.code).toBe('conflict');
		expect(world.didUpdates).toHaveLength(1);
	});

	it('answers 409 for a deactivated DID', async () => {
		const { agent, params } = await newAgent();
		world.dids.get(agent.did)!.deactivated = true;
		expect((await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true })).status).toBe(409);
		expect(world.didUpdates).toHaveLength(0);
	});

	it('answers 409 to a second rotation while one is in flight, and lets the first finish', async () => {
		const { agent, params } = await newAgent();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const engine = (await (agents as any).engineFor(customerA)) as {
			updateDid: (...a: unknown[]) => Promise<unknown>;
		};
		const original = Object.getPrototypeOf(engine).updateDid;
		const spy = jest.spyOn(Object.getPrototypeOf(engine), 'updateDid').mockImplementation(async function (
			this: unknown,
			...args: unknown[]
		) {
			await gate;
			return original.apply(this, args);
		});
		const first = rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		await new Promise((resolve) => setImmediate(resolve));
		const second = await rotate(params, { keyId: `${agent.did}#key-2`, confirm: true });
		expect(second.status).toBe(409);
		release();
		expect((await first).status).toBe(200);
		spy.mockRestore();
		expect(world.didUpdates).toHaveLength(1);
	});

	it('leaves the old key active and records nothing when the ledger write fails', async () => {
		const { agent, params } = await newAgent();
		world.failNextDidUpdate = new Error('boom');
		const failed = await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		expect(failed.status).toBe(500);
		expect(JSON.stringify(failed.body)).not.toMatch(/boom/);
		const keys = await agents.listKeys(customerA, agent.agentId);
		expect(keys.filter((k) => k.status === 'active')).toHaveLength(2);
		expect(store.events.filter((e) => e.type === 'key-rotated')).toHaveLength(0);
		expect(store.audit).toHaveLength(0);
		// And the lock is released: a retry works
		expect((await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true })).status).toBe(200);
	});

	it('answers 503 with Retry-After when the payer queue is busy', async () => {
		const { agent, params } = await newAgent();
		world.failNextDidUpdate = new LedgerUnavailableError('The ledger write queue is busy', 7);
		const busy = await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		expect(busy.status).toBe(503);
		expect(busy.headers['Retry-After']).toBe('7');
	});

	it('passes a ledger transaction hash through when the engine reports one', async () => {
		const { agent, params } = await newAgent();
		world.reportTxHash = 'ABC123';
		const result = await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		expect(result.body.didUpdate).toEqual({ txHash: 'ABC123' });
	});

	it('still succeeds when the event and audit writes fail', async () => {
		const { agent, params } = await newAgent();
		store.failEvents = true;
		const result = await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true });
		expect(result.status).toBe(200);
		expect(world.didUpdates).toHaveLength(1);
	});

	it('records api-key as the actor when the call came through an API key', async () => {
		const { agent, params } = await newAgent();
		await rotate(params, { keyId: `${agent.did}#key-1`, confirm: true }, { locals: { authMethod: 'api-key' } });
		expect(store.events.at(-1)?.actor).toBe('api-key');
	});

	it('replays a repeated Idempotency-Key without a second ledger write, and refuses the key with a different body', async () => {
		const { agent, params } = await newAgent();
		const rows = new Map<string, Record<string, unknown>>();
		const idempotency = new IdempotencyService({
			store: {
				insertSubmitting: async (row) => {
					const id = `${row.customerId}:${row.key}`;
					if (rows.has(id)) return null;
					rows.set(id, { id, ...row, state: 'submitting' });
					return rows.get(id) as never;
				},
				find: async (customerId, key) => (rows.get(`${customerId}:${key}`) as never) ?? null,
				settle: async (id, change) => void Object.assign(rows.get(id) as object, change),
				remove: async (id) => void rows.delete(id),
			},
		});
		const keyed = new AgentController(
			() => ({ agents }),
			() => idempotency
		);
		const body = { keyId: `${agent.did}#key-1`, confirm: true };
		const headers = { 'idempotency-key': 'rotate-1' };
		const first = await rotate(params, body, { headers, controllerOverride: keyed });
		const second = await rotate(params, body, { headers, controllerOverride: keyed });
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(second.body).toEqual(first.body);
		expect(second.headers['Idempotent-Replayed']).toBe('true');
		expect(world.didUpdates).toHaveLength(1);
		const different = await rotate(
			params,
			{ keyId: `${agent.did}#key-2`, confirm: true },
			{ headers, controllerOverride: keyed }
		);
		expect(different.status).toBe(422);
		expect(world.didUpdates).toHaveLength(1);
	});
});

describe('POST /agents/{id}/keys', () => {
	const add = (params: Record<string, string>, body: unknown, customer: unknown = customerA) =>
		call({
			handler: 'addKey',
			validators: V.addKeyValidator,
			params,
			body,
			customer,
			route: '/agents/:agentId/keys',
		});

	/** An agent that has only its P-256 key, as the add route is for. */
	async function p256OnlyAgent() {
		const made = await newAgent();
		const entry = world.dids.get(made.agent.did)!;
		const keep = `${made.agent.did}#key-1`;
		entry.doc = {
			...entry.doc,
			verificationMethod: (entry.doc.verificationMethod as Array<{ id: string }>).filter((m) => m.id === keep),
			authentication: [keep],
			assertionMethod: [keep],
		};
		return made;
	}

	it.each([
		['no type', {}],
		['P-256, which is not offered', { type: 'P-256' }],
		['an unknown type', { type: 'RSA' }],
	])('answers 400 for %s', async (_label, body) => {
		const { params } = await p256OnlyAgent();
		expect((await add(params, body)).status).toBe(400);
		expect(world.didUpdates).toHaveLength(0);
	});

	it('is 404 for another customer agent', async () => {
		const { params } = await p256OnlyAgent();
		const result = await add(params, { type: 'Ed25519' }, customerB);
		expect(result.status).toBe(404);
		expect(result.body).toEqual(NOT_FOUND_BODY);
	});

	it('adds an Ed25519 key (201), returns the key object, updates the DID and records the event', async () => {
		const { agent, params } = await p256OnlyAgent();
		const result = await add(params, { type: 'Ed25519' });
		expect(result.status).toBe(201);
		expect(result.body).toMatchObject({
			keyId: `${agent.did}#key-2`,
			type: 'Ed25519',
			algorithm: 'EdDSA',
			status: 'active',
			rotatedAt: null,
			usedBy: ['did', 'a2a', 'kya-os'],
		});
		expect(result.body.publicKeyMultibase).toMatch(/^z6Mk/);
		expect(world.didUpdates).toHaveLength(1);
		expect(store.events.at(-1)).toMatchObject({ type: 'key-added', detail: { keyId: `${agent.did}#key-2` } });
		expect(store.audit.at(-1)?.action).toBe('agent.key.added');
		const keys = await agents.listKeys(customerA, agent.agentId);
		expect(keys.find((k) => k.keyId === `${agent.did}#key-2`)?.createdAt).toBeInstanceOf(Date);
	});

	it('answers 409 when an Ed25519 key exists, for a new agent and after a first add', async () => {
		const full = await newAgent();
		expect((await add(full.params, { type: 'Ed25519' })).status).toBe(409);
		const { params } = await p256OnlyAgent();
		expect((await add(params, { type: 'Ed25519' })).status).toBe(201);
		expect((await add(params, { type: 'Ed25519' })).status).toBe(409);
		expect(world.didUpdates).toHaveLength(1);
	});

	it('allows a new Ed25519 key when the only one has been rotated out', async () => {
		const { agent, params } = await newAgent();
		await agents.rotateKey(customerA, agent.agentId, { keyId: `${agent.did}#key-2`, confirm: true });
		// Rotation replaces the key, so an active Ed25519 key still exists
		expect((await add(params, { type: 'Ed25519' })).status).toBe(409);
	});

	it('does not change the DID when the ledger write fails', async () => {
		const { params } = await p256OnlyAgent();
		world.failNextDidUpdate = new Error('boom');
		expect((await add(params, { type: 'Ed25519' })).status).toBe(500);
		expect(store.events.filter((e) => e.type === 'key-added')).toHaveLength(0);
	});
});

describe('GET /agents/{id}/activity', () => {
	const activity = (
		params: Record<string, string>,
		query: Record<string, string> = {},
		customer: unknown = customerA
	) => call({ handler: 'activity', validators: V.activityValidator, params, query, customer });

	it('records the agent life newest first, with who acted, and pages it', async () => {
		const { agent, params } = await newAgent();
		const made = await grant(agent.agentId, { grantType: 'tool-scope', tools: ['a'] });
		await agents.createCard(customerA, agent.agentId, {
			card: { endpoint: 'https://agent.example/a2a' },
			publish: true,
		});
		await agents.createCard(customerA, agent.agentId, { card: { endpoint: 'https://agent.example/a2a' } });
		await agents.revokeAuthority(customerA, agent.agentId, made.grant.id, { actor: 'api-key' });

		const result = await activity(params);
		expect(result.status).toBe(200);
		expect(result.body.total).toBe(5);
		expect(result.body.events.map((e: any) => e.type)).toEqual([
			'authority-revoked',
			'card-updated',
			'card-published',
			'authority-granted',
			'registered',
		]);
		expect(result.body.events[0].actor).toBe('api-key');
		expect(result.body.events[1].actor).toBe('owner');
		for (const event of result.body.events) {
			expect(Object.keys(event).sort()).toEqual(['actor', 'at', 'detail', 'id', 'type']);
			expect(['owner', 'api-key', 'system']).toContain(event.actor);
		}
		expect(JSON.stringify(result.body)).not.toMatch(/@|customerId/);

		const second = await activity(params, { limit: '2', page: '2' });
		expect(second.body.total).toBe(5);
		expect(second.body.events.map((e: any) => e.type)).toEqual(['card-published', 'authority-granted']);
	});

	it('validates paging', async () => {
		const { params } = await newAgent();
		expect((await activity(params, { limit: '0' })).status).toBe(400);
		expect((await activity(params, { page: '0' })).status).toBe(400);
		expect((await activity(params, { limit: '101' })).status).toBe(400);
		expect((await activity({ agentId: 'nope' })).status).toBe(400);
	});

	it('is 404 for another customer agent, and never returns their events', async () => {
		const { params } = await newAgent(customerB);
		const result = await activity(params);
		expect(result.status).toBe(404);
		expect(result.body).toEqual(NOT_FOUND_BODY);
		expect(store.calls.filter((c) => c.method === 'listEvents')).toHaveLength(0);
	});

	it('does not stop the change it describes when the event cannot be written', async () => {
		const { agent } = await newAgent();
		store.failEvents = true;
		const made = await grant(agent.agentId, { grantType: 'acts-for' });
		expect(made.grant.id).toBeTruthy();
		expect(store.events.filter((e) => e.type === 'authority-granted')).toHaveLength(0);
	});

	it('writes the key and expiry events with the details the portal shows', async () => {
		const { agent, params } = await newAgent();
		const made = await grant(agent.agentId, { grantType: 'acts-for', expiresAt: '2026-12-01T00:00:00Z' });
		await agents.changeGrantExpiry(customerA, agent.agentId, made.grant.id, { expiresAt: '2027-01-01T00:00:00Z' });
		const result = await activity(params);
		expect(result.body.events[0]).toMatchObject({
			type: 'authority-expiry-changed',
			detail: { grantId: made.grant.id, from: '2026-12-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' },
		});
	});
});

describe('PATCH /agents/{id}/authority/{grantId}', () => {
	const patch = (params: Record<string, string>, body: unknown, extra: Partial<Call> = {}) =>
		call({
			handler: 'changeGrantExpiry',
			validators: V.expiryValidator,
			params,
			body,
			customer: customerA,
			route: '/agents/:agentId/authority/:grantId',
			...extra,
		});
	const NEW_EXPIRY = '2027-03-01T00:00:00Z';

	it.each([
		['no expiresAt', {}],
		['a malformed date', { expiresAt: 'tomorrow' }],
		['a number', { expiresAt: 1790000000 }],
	])('answers 400 for %s', async (_label, body) => {
		const { agent } = await newAgent();
		const made = await grant(agent.agentId, { grantType: 'acts-for' });
		const result = await patch({ agentId: agent.agentId, grantId: made.grant.id }, body);
		expect(result.status).toBe(400);
	});

	it('answers 400 for an expiry in the past or later than the platform maximum, and changes nothing', async () => {
		const { agent } = await newAgent();
		const made = await grant(agent.agentId, {
			grantType: 'tool-scope',
			tools: ['a'],
			expiresAt: '2026-12-01T00:00:00Z',
		});
		const params = { agentId: agent.agentId, grantId: made.grant.id };
		const past = await patch(params, { expiresAt: '2026-11-19T00:00:00Z' });
		const equalNow = await patch(params, { expiresAt: now.toISOString() });
		const tooFar = await patch(params, { expiresAt: '2028-11-20T10:00:00Z' });
		expect([past.status, equalNow.status, tooFar.status]).toEqual([400, 400, 400]);
		expect(tooFar.body.error).toMatch(/maximum/);
		expect(store.grants.get(made.grant.id)?.expiresAt).toEqual(new Date('2026-12-01T00:00:00Z'));
		expect([...world.lists.values()].every((l) => l.entries.every((v) => v === 0))).toBe(true);
	});

	it('is 404 for another customer agent, for a grant of another agent, and for an unknown grant, with the same body', async () => {
		const mine = await newAgent();
		const theirs = await newAgent(customerB);
		const theirGrant = await grant(theirs.agent.agentId, { grantType: 'acts-for' }, customerB);
		const myGrant = await grant(mine.agent.agentId, { grantType: 'acts-for' });
		const otherAgent = await patch(
			{ agentId: theirs.agent.agentId, grantId: theirGrant.grant.id },
			{ expiresAt: NEW_EXPIRY }
		);
		const crossGrant = await patch(
			{ agentId: mine.agent.agentId, grantId: theirGrant.grant.id },
			{ expiresAt: NEW_EXPIRY }
		);
		const unknown = await patch({ agentId: mine.agent.agentId, grantId: ZERO }, { expiresAt: NEW_EXPIRY });
		expect(otherAgent.status).toBe(404);
		expect(otherAgent.body).toEqual(NOT_FOUND_BODY);
		expect(crossGrant.status).toBe(404);
		expect(unknown.status).toBe(404);
		expect(crossGrant.body).toEqual(unknown.body);
		expect(store.grants.get(theirGrant.grant.id)?.expiresAt).toBeNull();
		expect(store.grants.get(myGrant.grant.id)?.expiresAt).toBeNull();
	});

	it('answers 409 for a revoked grant and for an expired one', async () => {
		const { agent } = await newAgent();
		const revoked = await grant(agent.agentId, { grantType: 'acts-for' });
		await agents.revokeAuthority(customerA, agent.agentId, revoked.grant.id);
		const expiring = await grant(agent.agentId, { grantType: 'acts-for', expiresAt: '2026-11-21T00:00:00Z' });
		now = new Date('2026-11-22T00:00:00Z');
		const a = await patch({ agentId: agent.agentId, grantId: revoked.grant.id }, { expiresAt: NEW_EXPIRY });
		const b = await patch({ agentId: agent.agentId, grantId: expiring.grant.id }, { expiresAt: NEW_EXPIRY });
		expect([a.status, b.status]).toEqual([409, 409]);
		expect(a.body.error).toMatch(/revoked/);
		expect(b.body.error).toMatch(/expired/);
	});

	it('changes a tool-scope expiry: same grantId, new credential, old status entry revoked on its list, event written', async () => {
		const { agent } = await newAgent();
		const made = await grant(agent.agentId, {
			grantType: 'tool-scope',
			tools: ['search', 'fetch'],
			expiresAt: '2026-12-01T00:00:00Z',
		});
		const before = { ...store.grants.get(made.grant.id)! };
		const result = await patch({ agentId: agent.agentId, grantId: made.grant.id }, { expiresAt: NEW_EXPIRY });
		expect(result.status).toBe(200);
		expect(result.body.grant).toMatchObject({
			id: made.grant.id,
			grantType: 'tool-scope',
			expiresAt: new Date(NEW_EXPIRY),
			revokedAt: null,
			status: 'active',
			summary: 'Tools: search, fetch',
		});
		expect(result.body.credential.format).toBe('sd-jwt-vc');
		expect(result.body.credential.value).not.toBe(made.credential.value);

		const after = store.grants.get(made.grant.id)!;
		expect(after.statusIndex).not.toBe(before.statusIndex);
		const oldList = [...world.lists.values()].find((l) => l.entries[before.statusIndex as number] === 1);
		expect(oldList).toBeTruthy(); // old entry revoked (1)
		expect(
			world.lists.get(after.statusListUri as string) ??
				[...world.lists.values()].find((l) => l.entries[after.statusIndex as number] === 0)
		).toBeTruthy();
		expect(store.events.at(-1)).toMatchObject({
			type: 'authority-expiry-changed',
			detail: { grantId: made.grant.id },
		});
		// The decoded credential carries the new exp and the same tools
		const payload = JSON.parse(Buffer.from(result.body.credential.value.split('.')[1], 'base64url').toString());
		expect(payload).toMatchObject({
			tools: ['search', 'fetch'],
			exp: Math.floor(new Date(NEW_EXPIRY).getTime() / 1000),
		});
		expect(payload.status.status_list.idx).toBe(after.statusIndex);
	});

	it('reissues a mandate with the same constraints, bound to the current P-256 key', async () => {
		const { agent } = await newAgent();
		const mandate = {
			type: 'payment',
			constraints: [{ type: 'payment.amount_range', currency: 'USD', max: 5000 }],
		};
		const made = await grant(agent.agentId, { grantType: 'mandate', mandate });
		await agents.rotateKey(customerA, agent.agentId, { keyId: `${agent.did}#key-1`, confirm: true });
		const result = await patch({ agentId: agent.agentId, grantId: made.grant.id }, { expiresAt: NEW_EXPIRY });
		expect(result.status).toBe(200);
		const payload = JSON.parse(Buffer.from(result.body.credential.value.split('.')[1], 'base64url').toString());
		expect(payload.constraints).toEqual(mandate.constraints);
		const current = (await agents.listKeys(customerA, agent.agentId)).find(
			(k) => k.type === 'P-256' && k.status === 'active'
		)!;
		const resolved = world.dids.get(agent.did)!.doc.verificationMethod as Array<{
			id: string;
			publicKeyJwk?: { x: string };
		}>;
		expect(payload.cnf.jwk.x).toBe(resolved.find((m) => m.id === current.keyId)?.publicKeyJwk?.x);
		expect(result.body.grant.summary).toBe('Up to 50 USD');
	});

	it('changes an acts-for expiry', async () => {
		const { agent, organisation } = await newAgent();
		const made = await grant(agent.agentId, { grantType: 'acts-for' });
		const result = await patch({ agentId: agent.agentId, grantId: made.grant.id }, { expiresAt: NEW_EXPIRY });
		expect(result.status).toBe(200);
		expect(result.body.grant.summary).toBe(`Acts for ${organisation}`);
	});

	it('answers 409 for a KYA-OS delegation (no status list entry) and for older grants whose claims were not kept', async () => {
		const { agent } = await newAgent();
		const delegation = await grant(agent.agentId, { grantType: 'delegation', scopes: ['x'] });
		const legacy = await grant(agent.agentId, { grantType: 'tool-scope', tools: ['a'] });
		store.grants.get(legacy.grant.id)!.claims = null;
		const a = await patch({ agentId: agent.agentId, grantId: delegation.grant.id }, { expiresAt: NEW_EXPIRY });
		const b = await patch({ agentId: agent.agentId, grantId: legacy.grant.id }, { expiresAt: NEW_EXPIRY });
		expect([a.status, b.status]).toEqual([409, 409]);
		expect(b.body.error).toMatch(/grant again/);
	});

	it('fails closed and changes nothing in Studio when the old entry cannot be revoked', async () => {
		const { agent } = await newAgent();
		const made = await grant(agent.agentId, {
			grantType: 'tool-scope',
			tools: ['a'],
			expiresAt: '2026-12-01T00:00:00Z',
		});
		world.failNextTokenStatus = new Error('ledger down');
		const result = await patch({ agentId: agent.agentId, grantId: made.grant.id }, { expiresAt: NEW_EXPIRY });
		expect(result.status).toBe(500);
		expect(store.grants.get(made.grant.id)?.expiresAt).toEqual(new Date('2026-12-01T00:00:00Z'));
		expect(store.events.filter((e) => e.type === 'authority-expiry-changed')).toHaveLength(0);
		// The in-flight marker is released
		const retry = await patch({ agentId: agent.agentId, grantId: made.grant.id }, { expiresAt: NEW_EXPIRY });
		expect(retry.status).toBe(200);
	});

	it('replays a repeated Idempotency-Key without a second reissue', async () => {
		const { agent } = await newAgent();
		const made = await grant(agent.agentId, { grantType: 'tool-scope', tools: ['a'] });
		const rows = new Map<string, Record<string, unknown>>();
		const idempotency = new IdempotencyService({
			store: {
				insertSubmitting: async (row) => {
					const id = `${row.customerId}:${row.key}`;
					if (rows.has(id)) return null;
					rows.set(id, { id, ...row, state: 'submitting' });
					return rows.get(id) as never;
				},
				find: async (customerId, key) => (rows.get(`${customerId}:${key}`) as never) ?? null,
				settle: async (id, change) => void Object.assign(rows.get(id) as object, change),
				remove: async (id) => void rows.delete(id),
			},
		});
		const keyed = new AgentController(
			() => ({ agents }),
			() => idempotency
		);
		const params = { agentId: agent.agentId, grantId: made.grant.id };
		const headers = { 'idempotency-key': 'expiry-1' };
		const first = await patch(params, { expiresAt: NEW_EXPIRY }, { headers, controllerOverride: keyed });
		const used = [...world.lists.values()].reduce((n, l) => n + l.entries.filter((v) => v !== 0).length, 0);
		const second = await patch(params, { expiresAt: NEW_EXPIRY }, { headers, controllerOverride: keyed });
		expect(second.body).toEqual(first.body);
		expect(second.headers['Idempotent-Replayed']).toBe('true');
		expect([...world.lists.values()].reduce((n, l) => n + l.entries.filter((v) => v !== 0).length, 0)).toBe(used);
		expect(store.events.filter((e) => e.type === 'authority-expiry-changed')).toHaveLength(1);
	});
});

describe('summary function wiring', () => {
	it('is the only place grant text is built: the list route uses summariseGrant output verbatim', async () => {
		const { summariseGrant } = await import('../../../src/services/agent/grant-summary.js');
		const { agent, params } = await newAgent();
		const made = await grant(agent.agentId, { grantType: 'tool-scope', tools: ['x'] });
		const listed = await call({ handler: 'listAuthority', validators: V.idValidator, params, customer: customerA });
		expect(listed.body.grants[0].summary).toBe(
			summariseGrant({ grantType: 'tool-scope', claims: store.grants.get(made.grant.id)!.claims })
		);
	});
});
