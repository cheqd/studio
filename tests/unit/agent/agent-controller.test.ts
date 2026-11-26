import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AgentController } from '../../../src/controllers/api/agent.js';
import { AgentService } from '../../../src/services/agent/agent-service.js';
import { customerA, customerB, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';

let world: World;
let store: FakeStore;
let controller: AgentController;
let agents: AgentService;

beforeEach(() => {
	jest.spyOn(console, 'debug').mockImplementation(() => undefined);
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	const fresh = newWorld();
	world = fresh.world;
	store = fresh.store;
	agents = new AgentService({ store, engineFor: fresh.engineFor, kyaOsDelegationsEnabled: () => false });
	controller = new AgentController(() => ({ agents }));
});

interface Call {
	method: 'POST' | 'GET' | 'PATCH' | 'DELETE';
	handler: keyof AgentController;
	validators: Array<{ run: (req: Request) => Promise<unknown> }>;
	body?: unknown;
	params?: Record<string, string>;
	query?: Record<string, string>;
	customer?: unknown;
}

async function call(spec: Call) {
	const request = {
		method: spec.method,
		body: spec.body ?? {},
		params: spec.params ?? {},
		query: spec.query ?? {},
	} as unknown as Request;
	for (const validator of spec.validators) await validator.run(request);
	const response = {
		locals: { customer: spec.customer },
		statusCode: 0,
		body: undefined as unknown,
	} as unknown as Response & {
		statusCode: number;
		body: unknown;
	};
	response.status = ((code: number) => ((response.statusCode = code), response)) as never;
	response.json = ((body: unknown) => ((response.body = body), response)) as never;
	await (controller[spec.handler] as (req: Request, res: Response) => Promise<unknown>)(request, response);
	return { status: response.statusCode, body: response.body as Record<string, unknown> };
}

const V = AgentController;

async function registerViaRoute(customer = customerA, extra: Record<string, unknown> = {}) {
	const result = await call({
		method: 'POST',
		handler: 'register',
		validators: V.registerValidator,
		body: { name: 'route agent', ...extra },
		customer,
	});
	return result;
}

describe('POST /agents, GET /agents', () => {
	it('registers (201) with testnet as the default network, and lists', async () => {
		const created = await registerViaRoute();
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({ name: 'route agent', status: 'active', description: null });
		expect(created.body.did).toMatch(/^did:cheqd:testnet:/);
		expect(created.body).not.toHaveProperty('customerId');
		const list = await call({ method: 'GET', handler: 'list', validators: V.listValidator, customer: customerA });
		expect(list.status).toBe(200);
		expect(list.body.total).toBe(1);
	});

	it.each([
		['no name', { description: 'x' }],
		['an empty name', { name: '' }],
		['a bad network', { name: 'x', network: 'devnet' }],
		['a malformed actsForDid', { name: 'x', actsForDid: 'not-a-did' }],
	])('answers 400 for %s', async (_label, body) => {
		const result = await call({
			method: 'POST',
			handler: 'register',
			validators: V.registerValidator,
			body,
			customer: customerA,
		});
		expect(result.status).toBe(400);
		expect(typeof result.body.error).toBe('string');
	});

	it('answers 401 without a customer, and 404 for an actsForDid in another account', async () => {
		expect((await registerViaRoute(null as never)).status).toBe(401);
		const bOrganisation = await seedOrganisationDid(world, customerB);
		expect((await registerViaRoute(customerA, { actsForDid: bOrganisation })).status).toBe(404);
	});

	it('validates paging', async () => {
		expect(
			(
				await call({
					method: 'GET',
					handler: 'list',
					validators: V.listValidator,
					query: { limit: '0' },
					customer: customerA,
				})
			).status
		).toBe(400);
		expect(
			(
				await call({
					method: 'GET',
					handler: 'list',
					validators: V.listValidator,
					query: { page: '0' },
					customer: customerA,
				})
			).status
		).toBe(400);
	});

	it('does not leak internals on an unexpected failure', async () => {
		const broken = new AgentController(() => {
			throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
		});
		const request = { body: { name: 'x' }, params: {}, query: {} } as unknown as Request;
		const response = { locals: { customer: customerA } } as unknown as Response & {
			statusCode: number;
			body: unknown;
		};
		response.status = ((code: number) => ((response.statusCode = code), response)) as never;
		response.json = ((body: unknown) => ((response.body = body), response)) as never;
		await broken.register(request, response);
		expect(response.statusCode).toBe(500);
		expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|hunter2/);
	});

	it('maps a payer with no CHEQ to 402', async () => {
		const failing = new AgentController(() => ({
			agents: {
				register: async () => {
					throw new Error("Account 'cheqd1abc' does not exist on chain");
				},
			} as never,
		}));
		const response = { locals: { customer: customerA } } as unknown as Response & { statusCode: number };
		response.status = ((code: number) => ((response.statusCode = code), response)) as never;
		response.json = (() => response) as never;
		await failing.register({ body: { name: 'x' }, params: {}, query: {} } as unknown as Request, response);
		expect(response.statusCode).toBe(402);
	});
});

describe('GET, PATCH, DELETE /agents/{agentId}', () => {
	it('gets, patches and deletes an own agent', async () => {
		const { body } = await registerViaRoute();
		const params = { agentId: body.agentId as string };
		expect(
			(await call({ method: 'GET', handler: 'get', validators: V.idValidator, params, customer: customerA }))
				.status
		).toBe(200);
		const patched = await call({
			method: 'PATCH',
			handler: 'update',
			validators: V.updateValidator,
			params,
			body: { description: 'new', status: 'suspended' },
			customer: customerA,
		});
		expect(patched.body).toMatchObject({ description: 'new', status: 'suspended' });
		const deleted = await call({
			method: 'DELETE',
			handler: 'remove',
			validators: V.idValidator,
			params,
			customer: customerA,
		});
		expect(deleted).toMatchObject({ status: 200, body: { deleted: true, revokedGrants: 0 } });
		expect(
			(await call({ method: 'GET', handler: 'get', validators: V.idValidator, params, customer: customerA }))
				.status
		).toBe(404);
	});

	it('answers 400 for a malformed id or patch', async () => {
		expect(
			(
				await call({
					method: 'GET',
					handler: 'get',
					validators: V.idValidator,
					params: { agentId: '1' },
					customer: customerA,
				})
			).status
		).toBe(400);
		const { body } = await registerViaRoute();
		const params = { agentId: body.agentId as string };
		expect(
			(
				await call({
					method: 'PATCH',
					handler: 'update',
					validators: V.updateValidator,
					params,
					body: { status: 'deleted' },
					customer: customerA,
				})
			).status
		).toBe(400);
		expect(
			(
				await call({
					method: 'PATCH',
					handler: 'update',
					validators: V.updateValidator,
					params,
					body: {},
					customer: customerA,
				})
			).status
		).toBe(400);
	});
});

describe('cards and authority over HTTP', () => {
	async function agentWithOrganisation() {
		const organisation = await seedOrganisationDid(world, customerA);
		const { body } = await registerViaRoute(customerA, { actsForDid: organisation });
		return { organisation, params: { agentId: body.agentId as string } };
	}

	it('creates (201), publishes and reads a card', async () => {
		const { params } = await agentWithOrganisation();
		const created = await call({
			method: 'POST',
			handler: 'createCard',
			validators: V.createCardValidator,
			params,
			body: { card: { endpoint: 'https://agent.example/a2a', skills: [{ id: 's', name: 'S' }] }, publish: true },
			customer: customerA,
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({ version: 1 });
		expect(created.body.resourceId).toBeTruthy();
		const read = await call({
			method: 'GET',
			handler: 'getCard',
			validators: V.getCardValidator,
			params,
			customer: customerA,
		});
		expect(read.body.version).toBe(1);
		expect(
			(
				await call({
					method: 'GET',
					handler: 'getCard',
					validators: V.getCardValidator,
					params,
					query: { version: '2' },
					customer: customerA,
				})
			).status
		).toBe(404);
	});

	it.each([
		['no card', {}],
		['a plain-http endpoint', { card: { endpoint: 'http://agent.example/a2a' } }],
		['a bad alg', { card: { endpoint: 'https://a.example/a2a' }, alg: 'RS256' }],
		['a skill with no name', { card: { endpoint: 'https://a.example/a2a', skills: [{ id: 's' }] } }],
	])('answers 400 for %s', async (_label, body) => {
		const { params } = await agentWithOrganisation();
		expect(
			(
				await call({
					method: 'POST',
					handler: 'createCard',
					validators: V.createCardValidator,
					params,
					body,
					customer: customerA,
				})
			).status
		).toBe(400);
	});

	it('grants (201, credential returned once) and revokes authority', async () => {
		const { params } = await agentWithOrganisation();
		const granted = await call({
			method: 'POST',
			handler: 'grantAuthority',
			validators: V.grantValidator,
			params,
			body: { grantType: 'tool-scope', tools: ['search'] },
			customer: customerA,
		});
		expect(granted.status).toBe(201);
		expect((granted.body.credential as { format: string }).format).toBe('sd-jwt-vc');
		const grant = granted.body.grant as { id: string; grantType: string };
		const revoked = await call({
			method: 'DELETE',
			handler: 'revokeAuthority',
			validators: V.revokeValidator,
			params: { ...params, grantId: grant.id },
			customer: customerA,
		});
		expect(revoked.status).toBe(200);
		expect(revoked.body.revokedAt).toBeTruthy();
	});

	it('lists grants with a status and never returns the credential', async () => {
		const { params } = await agentWithOrganisation();
		const grantOf = async (body: Record<string, unknown>) =>
			(
				(
					await call({
						method: 'POST',
						handler: 'grantAuthority',
						validators: V.grantValidator,
						params,
						body,
						customer: customerA,
					})
				).body.grant as { id: string }
			).id;
		const live = await grantOf({ grantType: 'tool-scope', tools: ['search'] });
		const revoked = await grantOf({ grantType: 'acts-for' });
		await call({
			method: 'DELETE',
			handler: 'revokeAuthority',
			validators: V.revokeValidator,
			params: { ...params, grantId: revoked },
			customer: customerA,
		});

		const listed = await call({
			method: 'GET',
			handler: 'listAuthority',
			validators: V.idValidator,
			params,
			customer: customerA,
		});
		expect(listed.status).toBe(200);
		const grants = listed.body.grants as Array<Record<string, unknown>>;
		expect(grants.map((g) => [g.id, g.status]).sort()).toEqual(
			[
				[live, 'active'],
				[revoked, 'revoked'],
			].sort()
		);
		for (const grant of grants) {
			expect(Object.keys(grant).sort()).toEqual(
				['createdAt', 'expiresAt', 'grantType', 'hasCredential', 'id', 'revokedAt', 'status', 'summary'].sort()
			);
		}
		// Only the flag: the credential itself is served by its own owner-only route
		expect(JSON.stringify(listed.body)).not.toMatch(/"credential"|eyJ|issuedCredentialId|statusList/i);
	});

	it('shows an expired grant as expired', async () => {
		const { params } = await agentWithOrganisation();
		await call({
			method: 'POST',
			handler: 'grantAuthority',
			validators: V.grantValidator,
			params,
			body: { grantType: 'acts-for', expiresAt: new Date(Date.now() + 60_000).toISOString() },
			customer: customerA,
		});
		for (const grant of store.grants.values()) grant.expiresAt = new Date(Date.now() - 1000);
		const listed = await call({
			method: 'GET',
			handler: 'listAuthority',
			validators: V.idValidator,
			params,
			customer: customerA,
		});
		expect((listed.body.grants as Array<{ status: string }>)[0].status).toBe('expired');
	});

	it("is 404 for another customer's agent and for an unknown agent, with the same body", async () => {
		const { params } = await agentWithOrganisation();
		const other = await call({
			method: 'GET',
			handler: 'listAuthority',
			validators: V.idValidator,
			params,
			customer: customerB,
		});
		const unknown = await call({
			method: 'GET',
			handler: 'listAuthority',
			validators: V.idValidator,
			params: { agentId: '99999999-9999-4999-8999-999999999999' },
			customer: customerB,
		});
		expect(other.status).toBe(404);
		expect(unknown.status).toBe(404);
		expect(other.body).toEqual(unknown.body);
	});

	it.each([
		['an unknown grant type', { grantType: 'root' }],
		['a bad expiry', { grantType: 'acts-for', expiresAt: 'tomorrow' }],
		['tools that are not a list', { grantType: 'tool-scope', tools: 'search' }],
		[
			'a mandate that asks for re-delegation',
			{
				grantType: 'mandate',
				mandate: {
					type: 'payment',
					constraints: [{ type: 'payment.amount_range', currency: 'USD', max: 1 }],
					delegateTo: 'did:cheqd:testnet:x',
				},
			},
		],
	])('answers 400 for %s', async (_label, body) => {
		const { params } = await agentWithOrganisation();
		expect(
			(
				await call({
					method: 'POST',
					handler: 'grantAuthority',
					validators: V.grantValidator,
					params,
					body,
					customer: customerA,
				})
			).status
		).toBe(400);
	});

	it('answers 403 for a KYA-OS delegation while the flag is off', async () => {
		const { params } = await agentWithOrganisation();
		const result = await call({
			method: 'POST',
			handler: 'grantAuthority',
			validators: V.grantValidator,
			params,
			body: { grantType: 'delegation', scopes: ['x'] },
			customer: customerA,
		});
		expect(result).toMatchObject({ status: 403, body: { code: 'feature_disabled' } });
	});
});

describe('cross-tenant refusal on every agent route: customer B gets 404 for customer A agent', () => {
	let target: { agentId: string; grantId: string };

	beforeEach(async () => {
		const organisation = await seedOrganisationDid(world, customerA);
		const { body } = await registerViaRoute(customerA, { actsForDid: organisation });
		const params = { agentId: body.agentId as string };
		await call({
			method: 'POST',
			handler: 'createCard',
			validators: V.createCardValidator,
			params,
			body: { card: { endpoint: 'https://agent.example/a2a' } },
			customer: customerA,
		});
		const granted = await call({
			method: 'POST',
			handler: 'grantAuthority',
			validators: V.grantValidator,
			params,
			body: { grantType: 'acts-for' },
			customer: customerA,
		});
		target = { agentId: params.agentId, grantId: (granted.body.grant as { id: string }).id };
	});

	const routes: Array<[string, (t: { agentId: string; grantId: string }) => Call]> = [
		[
			'GET /agents/{id}',
			(t) => ({ method: 'GET', handler: 'get', validators: V.idValidator, params: { agentId: t.agentId } }),
		],
		[
			'PATCH /agents/{id}',
			(t) => ({
				method: 'PATCH',
				handler: 'update',
				validators: V.updateValidator,
				params: { agentId: t.agentId },
				body: { name: 'hijacked' },
			}),
		],
		[
			'DELETE /agents/{id}',
			(t) => ({ method: 'DELETE', handler: 'remove', validators: V.idValidator, params: { agentId: t.agentId } }),
		],
		[
			'POST /agents/{id}/card',
			(t) => ({
				method: 'POST',
				handler: 'createCard',
				validators: V.createCardValidator,
				params: { agentId: t.agentId },
				body: { card: { endpoint: 'https://b.example/a2a' } },
			}),
		],
		[
			'GET /agents/{id}/card',
			(t) => ({
				method: 'GET',
				handler: 'getCard',
				validators: V.getCardValidator,
				params: { agentId: t.agentId },
			}),
		],
		[
			'GET /agents/{id}/authority',
			(t) => ({
				method: 'GET',
				handler: 'listAuthority',
				validators: V.idValidator,
				params: { agentId: t.agentId },
			}),
		],
		[
			'POST /agents/{id}/authority',
			(t) => ({
				method: 'POST',
				handler: 'grantAuthority',
				validators: V.grantValidator,
				params: { agentId: t.agentId },
				body: { grantType: 'tool-scope', tools: ['x'] },
			}),
		],
		[
			'DELETE /agents/{id}/authority/{grantId}',
			(t) => ({
				method: 'DELETE',
				handler: 'revokeAuthority',
				validators: V.revokeValidator,
				params: { agentId: t.agentId, grantId: t.grantId },
			}),
		],
	];

	it.each(routes)('%s', async (_name, build) => {
		const before = {
			agents: JSON.stringify([...store.agents.values()]),
			cards: store.cards.length,
			grants: JSON.stringify([...store.grants.values()]),
		};
		const result = await call({ ...build(target), customer: customerB });
		expect(result.status).toBe(404);
		expect(JSON.stringify(result.body)).not.toContain(customerA.customerId);
		expect(JSON.stringify([...store.agents.values()])).toBe(before.agents);
		expect(store.cards).toHaveLength(before.cards);
		expect(JSON.stringify([...store.grants.values()])).toBe(before.grants);
	});

	it('GET /agents never includes the other customer agents', async () => {
		const list = await call({ method: 'GET', handler: 'list', validators: V.listValidator, customer: customerB });
		expect(list.body).toMatchObject({ total: 0, agents: [] });
	});
});

describe('Idempotency-Key on the ledger-writing agent routes', () => {
	it('registers once for a repeated key, and answers 422 for the same key with a different body', async () => {
		const { IdempotencyService } = await import('../../../src/services/idempotency/idempotency.js');
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
		const send = async (name: string, key?: string) => {
			const request = {
				method: 'POST',
				body: { name },
				params: {},
				query: {},
				headers: key ? { 'idempotency-key': key } : {},
				route: { path: '/agents' },
			} as unknown as Request;
			for (const validator of V.registerValidator) await validator.run(request);
			const out = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> } as {
				statusCode: number;
				body: Record<string, unknown>;
				headers: Record<string, string>;
			};
			const response = { locals: { customer: customerA } } as unknown as Response;
			response.status = ((code: number) => ((out.statusCode = code), response)) as never;
			response.json = ((body: Record<string, unknown>) => ((out.body = body), response)) as never;
			response.setHeader = ((name: string, value: string) => ((out.headers[name] = value), response)) as never;
			await keyed.register(request, response);
			return out;
		};

		const first = await send('bot', 'key-1');
		const second = await send('bot', 'key-1');
		expect(first.statusCode).toBe(201);
		expect(second.statusCode).toBe(201);
		expect(second.body).toEqual(first.body);
		expect(second.headers['Idempotent-Replayed']).toBe('true');
		expect((await store.listAgents(customerA.customerId, { limit: 50, offset: 0 })).total).toBe(1);

		const different = await send('other', 'key-1');
		expect(different.statusCode).toBe(422);
		expect(different.body.code).toBe('idempotency_key_reused');

		// Without the header the route behaves as before: two calls make two agents
		await send('plain');
		await send('plain');
		expect((await store.listAgents(customerA.customerId, { limit: 50, offset: 0 })).total).toBe(3);
	});
});
