import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AgentController } from '../../../src/controllers/api/agent.js';
import { AgentService, MAX_PAYMENT_ADDRESSES } from '../../../src/services/agent/agent-service.js';
import { AgentServiceError } from '../../../src/services/agent/agent-errors.js';
import { decodeSdJwtUnverified } from '../../../src/services/agent/sd-jwt.js';
import { summariseMandate } from '../../../src/services/agent/settlement.js';
import { VCT } from '../../../src/types/agent.js';
import { customerA, customerB, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';

let world: World;
let store: FakeStore;
let agents: AgentService;
let controller: AgentController;
let now = new Date('2026-11-20T10:00:00Z');

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const account = (n = 0) => `eip155:8453:0x${n.toString(16).padStart(40, '0')}`;

const mandate = {
	type: 'payment' as const,
	constraints: [
		{ type: 'payment.amount_range', currency: 'USD', max: 2500, min: 100 },
		{ type: 'payment.budget', currency: 'USD', max: 120 },
		{ type: 'payment.agent_recurrence', frequency: 'MONTHLY', max_occurrences: 6 },
		{ type: 'payment.allowed_payees', allowed: [{ name: 'Acme Travel' }, { name: 'Globex' }] },
		{ type: 'payment.execution_date', not_after: '2027-06-01T00:00:00Z' },
	],
};

beforeEach(() => {
	jest.spyOn(console, 'debug').mockImplementation(() => undefined);
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	now = new Date('2026-11-20T10:00:00Z');
	const fresh = newWorld();
	world = fresh.world;
	store = fresh.store;
	agents = new AgentService({ store, engineFor: fresh.engineFor, statusListSize: 64, now: () => now });
	controller = new AgentController(() => ({ agents }));
});

async function newAgent(customer = customerA) {
	const organisation = await seedOrganisationDid(world, customer);
	const agent = await agents.register(customer, { name: 'payer', network: 'testnet', actsForDid: organisation });
	return { agent, organisation };
}

const listEntry = (uri: string, index: number) => world.lists.get(uri)?.entries[index];

describe('bindPaymentAddress', () => {
	it('issues an SD-JWT VC signed by the agent key, with a status entry, and stores no credential', async () => {
		const { agent } = await newAgent();
		const issued = await agents.bindPaymentAddress(customerA, agent.agentId, { account: `eip155:8453:${ADDRESS}` });

		expect(issued.binding.account).toBe(`eip155:8453:${ADDRESS.toLowerCase()}`);
		expect(issued.credential.format).toBe('sd-jwt-vc');
		const decoded = decodeSdJwtUnverified(issued.credential.value);
		expect(decoded?.header).toMatchObject({ typ: 'dc+sd-jwt', kid: `${agent.did}#key-1`, alg: 'ES256' });
		expect(decoded?.payload).toMatchObject({
			iss: agent.did,
			sub: agent.did,
			vct: VCT.paymentAddressBinding,
			account: issued.binding.account,
		});
		const status = (decoded?.payload.status as { status_list: { idx: number; uri: string } }).status_list;
		expect(listEntry(status.uri, status.idx)).toBe(0);
		// the status list belongs to the agent DID, and the signature was made by the engine with the agent DID
		expect(world.lists.get(status.uri)?.did).toBe(agent.did);
		expect(world.signCalls.at(-1)).toMatchObject({ did: agent.did, kid: `${agent.did}#key-1` });

		// nothing but the row: the stored binding has no credential
		expect(JSON.stringify([...store.bindings.values()])).not.toContain(issued.credential.value);
	});

	it('lists without the credential, newest first', async () => {
		const { agent } = await newAgent();
		await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		const second = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(2) });
		const list = await agents.listPaymentAddresses(customerA, agent.agentId);
		expect(list.map((b) => b.account)).toEqual([account(2), account(1)]);
		expect(list[0]).toEqual({
			id: second.binding.id,
			account: account(2),
			status: 'active',
			createdAt: expect.any(Date),
			revokedAt: null,
		});
		expect(JSON.stringify(list)).not.toContain('~');
	});

	it.each([
		['malformed', 'not-an-account'],
		['bad checksum', `eip155:1:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD`],
		['not a string', 7],
	])('answers 400 for a %s account, before any key is used', async (_l, bad) => {
		const { agent } = await newAgent();
		const calls = world.signCalls.length;
		await expect(agents.bindPaymentAddress(customerA, agent.agentId, { account: bad })).rejects.toMatchObject({
			status: 400,
		});
		expect(world.signCalls).toHaveLength(calls);
		expect(world.lists.size).toBe(0);
	});

	it('answers 409 for the same account twice, but allows it again after a revocation', async () => {
		const { agent } = await newAgent();
		const first = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		await expect(
			agents.bindPaymentAddress(customerA, agent.agentId, {
				account: account(1).toUpperCase().replace('EIP155', 'eip155').replace('0X', '0x'),
			})
		).rejects.toMatchObject({ status: 409 });
		await agents.revokePaymentAddress(customerA, agent.agentId, first.binding.id);
		await expect(
			agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) })
		).resolves.toBeTruthy();
	});

	it('caps the live bindings per agent', async () => {
		const { agent } = await newAgent();
		for (let i = 1; i <= MAX_PAYMENT_ADDRESSES; i++) {
			await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(i) });
		}
		await expect(
			agents.bindPaymentAddress(customerA, agent.agentId, { account: account(99) })
		).rejects.toMatchObject({ status: 409 });
		// revoking one frees a place
		const [one] = await agents.listPaymentAddresses(customerA, agent.agentId);
		await agents.revokePaymentAddress(customerA, agent.agentId, (one as { id: string }).id);
		await expect(
			agents.bindPaymentAddress(customerA, agent.agentId, { account: account(99) })
		).resolves.toBeTruthy();
	});

	it('refuses a suspended agent (409)', async () => {
		const { agent } = await newAgent();
		await agents.update(customerA, agent.agentId, { status: 'suspended' });
		await expect(
			agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) })
		).rejects.toMatchObject({ status: 409 });
	});

	it('answers 501 when the engine has no signing or status list methods', async () => {
		const bare = new AgentService({
			store,
			engineFor: async () => ({ name: 'veramo' }) as never,
		});
		const { agent } = await newAgent();
		await expect(bare.bindPaymentAddress(customerA, agent.agentId, { account: account(1) })).rejects.toMatchObject({
			status: 501,
		});
	});
});

describe('revokePaymentAddress and the agent lifecycle', () => {
	it('revokes on the status list and records revokedAt; revoking twice is a no-op', async () => {
		const { agent } = await newAgent();
		const issued = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		const { uri, idx } = (
			decodeSdJwtUnverified(issued.credential.value)?.payload.status as {
				status_list: { idx: number; uri: string };
			}
		).status_list;
		const revoked = await agents.revokePaymentAddress(customerA, agent.agentId, issued.binding.id);
		expect(revoked.revokedAt).toBeTruthy();
		expect(listEntry(uri, idx)).toBe(1);
		const again = await agents.revokePaymentAddress(customerA, agent.agentId, issued.binding.id);
		expect(again.revokedAt).toEqual(revoked.revokedAt);
		expect((await agents.listPaymentAddresses(customerA, agent.agentId))[0]).toMatchObject({ status: 'revoked' });
	});

	it('suspending the agent suspends its bindings on the status list; reactivating restores only live ones', async () => {
		const { agent } = await newAgent();
		const live = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		const dead = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(2) });
		await agents.revokePaymentAddress(customerA, agent.agentId, dead.binding.id);
		const pos = (token: string) =>
			(decodeSdJwtUnverified(token)?.payload.status as { status_list: { idx: number; uri: string } }).status_list;
		const liveAt = pos(live.credential.value);
		const deadAt = pos(dead.credential.value);

		await agents.update(customerA, agent.agentId, { status: 'suspended' });
		expect(listEntry(liveAt.uri, liveAt.idx)).toBe(2);
		expect(listEntry(deadAt.uri, deadAt.idx)).toBe(1);
		expect((await agents.listPaymentAddresses(customerA, agent.agentId)).map((b) => b.status)).toEqual([
			'revoked',
			'suspended',
		]);

		await agents.update(customerA, agent.agentId, { status: 'active' });
		expect(listEntry(liveAt.uri, liveAt.idx)).toBe(0);
		expect(listEntry(deadAt.uri, deadAt.idx)).toBe(1);
	});

	it('does not suspend the agent when the status list cannot be written', async () => {
		const { agent } = await newAgent();
		await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		const noStatus = new AgentService({
			store,
			engineFor: async () => ({ name: 'credo' }) as never,
		});
		await expect(noStatus.update(customerA, agent.agentId, { status: 'suspended' })).rejects.toMatchObject({
			status: 501,
		});
		expect((await store.getAgent(customerA.customerId, agent.agentId))?.status).toBe('active');
	});

	it('deleting the agent revokes live bindings first, and does not delete when that fails', async () => {
		const { agent } = await newAgent();
		const issued = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		const { uri, idx } = (
			decodeSdJwtUnverified(issued.credential.value)?.payload.status as {
				status_list: { idx: number; uri: string };
			}
		).status_list;

		const noStatus = new AgentService({ store, engineFor: async () => ({ name: 'credo' }) as never });
		await expect(noStatus.remove(customerA, agent.agentId)).rejects.toMatchObject({ status: 501 });
		expect((await store.getAgent(customerA.customerId, agent.agentId))?.status).toBe('active');

		expect(await agents.remove(customerA, agent.agentId)).toEqual({ revokedGrants: 0, revokedPaymentAddresses: 1 });
		expect(listEntry(uri, idx)).toBe(1);
		expect([...store.bindings.values()][0]?.revokedAt).toBeTruthy();
	});
});

describe('settlement', () => {
	async function agentWithMandate(expiresAt?: string) {
		const { agent, organisation } = await newAgent();
		const granted = await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'mandate',
			issuerDid: organisation,
			mandate,
			expiresAt,
		});
		return { agent, organisation, grant: granted.grant };
	}

	it('is 404 with no mandate, with the same body as an unknown agent', async () => {
		const { agent } = await newAgent();
		const none = await agents.settlement(customerA, agent.agentId).catch((e) => e as AgentServiceError);
		expect(none).toMatchObject({ status: 404, code: 'not_found' });
		const unknown = await agents
			.settlement(customerA, '99999999-9999-4999-8999-999999999999')
			.catch((e) => e as AgentServiceError);
		expect(unknown).toMatchObject({ status: 404, code: 'not_found' });
	});

	it('derives the policy from the mandate summary and lists active bindings as pays-from', async () => {
		const { agent, grant } = await agentWithMandate('2027-01-01T00:00:00Z');
		const bound = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		const revoked = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(2) });
		await agents.revokePaymentAddress(customerA, agent.agentId, revoked.binding.id);

		const view = await agents.settlement(customerA, agent.agentId);
		expect(view).toMatchObject({
			label: 'Proposed',
			readOnly: true,
			agentId: agent.agentId,
			agentStatus: 'active',
			mandate: { id: grant.id, type: 'payment', expiresAt: new Date('2027-01-01T00:00:00Z') },
			policy: {
				capPerPayment: { currency: 'USD', max: 2500, min: 100, unit: 'minor' },
				budget: { currency: 'USD', max: 120, unit: 'major' },
				repeats: { frequency: 'MONTHLY', maxOccurrences: 6 },
				payees: ['Acme Travel', 'Globex'],
				window: { notBefore: null, notAfter: '2027-06-01T00:00:00Z' },
			},
			payFrom: [{ bindingId: bound.binding.id, account: account(1) }],
		});
		// single hop: no delegation fields anywhere
		expect(JSON.stringify(view)).not.toMatch(/deleg|parent|chain|cnf/i);
	});

	it('keeps only the non-secret summary: no signed mandate is stored', async () => {
		const { grant } = await agentWithMandate();
		const stored = JSON.stringify(store.grants.get(grant.id));
		expect(stored).not.toContain('~');
		expect(stored).not.toContain('eyJ');
		expect(store.grants.get(grant.id)?.policySummary).toEqual(summariseMandate(mandate));
	});

	it('is 404 once the mandate is revoked or expired, and for a checkout mandate or older grants without a summary', async () => {
		const { agent, grant } = await agentWithMandate('2026-12-01T00:00:00Z');
		now = new Date('2026-12-02T00:00:00Z');
		await expect(agents.settlement(customerA, agent.agentId)).rejects.toMatchObject({ status: 404 });
		now = new Date('2026-11-20T10:00:00Z');
		await expect(agents.settlement(customerA, agent.agentId)).resolves.toBeTruthy();
		await agents.revokeAuthority(customerA, agent.agentId, grant.id);
		await expect(agents.settlement(customerA, agent.agentId)).rejects.toMatchObject({ status: 404 });

		const { agent: other, organisation } = await newAgent();
		await agents.grantAuthority(customerA, other.agentId, {
			grantType: 'mandate',
			issuerDid: organisation,
			mandate: {
				type: 'checkout',
				constraints: [{ type: 'checkout.allowed_merchants', allowed: [{ name: 'Acme' }] }],
			},
		});
		await expect(agents.settlement(customerA, other.agentId)).rejects.toMatchObject({ status: 404 });
		const { agent: legacy, organisation: org3 } = await newAgent();
		const old = await agents.grantAuthority(customerA, legacy.agentId, {
			grantType: 'mandate',
			issuerDid: org3,
			mandate,
		});
		store.grants.get(old.grant.id)!.policySummary = null;
		await expect(agents.settlement(customerA, legacy.agentId)).rejects.toMatchObject({ status: 404 });
	});

	it('offers no pays-from while the agent is suspended, and uses the newest of several mandates', async () => {
		const { agent, organisation, grant: older } = await agentWithMandate();
		// The fake store stamps grants with the wall clock; put both mandates on the test clock, or the older one
		// becomes the newest once the wall clock passes the fixed test time.
		store.grants.get(older.id)!.createdAt = new Date(now);
		await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
		now = new Date(now.getTime() + 1000);
		const newer = await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'mandate',
			issuerDid: organisation,
			mandate: { type: 'payment', constraints: [{ type: 'payment.amount_range', currency: 'EUR', max: 5 }] },
		});
		store.grants.get(newer.grant.id)!.createdAt = new Date(now);
		await agents.update(customerA, agent.agentId, { status: 'suspended' });
		const view = await agents.settlement(customerA, agent.agentId);
		expect(view.mandate.id).toBe(newer.grant.id);
		expect(view.policy.capPerPayment).toMatchObject({ currency: 'EUR', max: 5 });
		expect(view.agentStatus).toBe('suspended');
		expect(view.payFrom).toEqual([]);
	});
});

describe('routes', () => {
	async function call(
		handler: keyof AgentController,
		validators: Array<{ run: (r: Request) => Promise<unknown> }>,
		spec: {
			params?: Record<string, string>;
			body?: unknown;
			customer?: unknown;
			headers?: Record<string, string>;
		}
	) {
		const request = {
			method: 'POST',
			body: spec.body ?? {},
			params: spec.params ?? {},
			query: {},
			headers: spec.headers ?? {},
		} as unknown as Request;
		for (const validator of validators) await validator.run(request);
		const out = { status: 0, body: undefined as unknown };
		const response = { locals: { customer: spec.customer } } as unknown as Response;
		response.status = ((code: number) => ((out.status = code), response)) as never;
		response.json = ((body: unknown) => ((out.body = body), response)) as never;
		await (controller[handler] as (req: Request, res: Response) => Promise<unknown>)(request, response);
		return out as { status: number; body: Record<string, unknown> };
	}
	const V = AgentController;

	it('POST 201 returns the credential once; GET lists without it; DELETE revokes', async () => {
		const { agent } = await newAgent();
		const params = { agentId: agent.agentId };
		const created = await call('bindPaymentAddress', V.bindPaymentAddressValidator, {
			params,
			body: { account: `eip155:8453:${ADDRESS}` },
			customer: customerA,
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({
			paymentAddress: { account: `eip155:8453:${ADDRESS.toLowerCase()}`, status: 'active', revokedAt: null },
			credential: { format: 'sd-jwt-vc' },
		});
		const id = (created.body.paymentAddress as { id: string }).id;

		const listed = await call('listPaymentAddresses', V.idValidator, { params, customer: customerA });
		expect(listed.status).toBe(200);
		expect(JSON.stringify(listed.body)).not.toContain('credential');
		expect(listed.body.paymentAddresses).toHaveLength(1);

		const revoked = await call('revokePaymentAddress', V.revokePaymentAddressValidator, {
			params: { ...params, bindingId: id },
			customer: customerA,
		});
		expect(revoked).toMatchObject({ status: 200, body: { id, status: 'revoked' } });
	});

	it.each([
		['a missing account', {}],
		['a malformed account', { account: 'eip155:1:0x12' }],
		['an account that is not a string', { account: 5 }],
	])('POST answers 400 for %s', async (_l, body) => {
		const { agent } = await newAgent();
		const result = await call('bindPaymentAddress', V.bindPaymentAddressValidator, {
			params: { agentId: agent.agentId },
			body,
			customer: customerA,
		});
		expect(result.status).toBe(400);
	});

	it('answers 400 for malformed ids and 401 without a customer', async () => {
		expect(
			(await call('listPaymentAddresses', V.idValidator, { params: { agentId: 'nope' }, customer: customerA }))
				.status
		).toBe(400);
		expect(
			(
				await call('revokePaymentAddress', V.revokePaymentAddressValidator, {
					params: { agentId: '99999999-9999-4999-8999-999999999999', bindingId: 'x' },
					customer: customerA,
				})
			).status
		).toBe(400);
		expect(
			(await call('settlement', V.idValidator, { params: { agentId: '99999999-9999-4999-8999-999999999999' } }))
				.status
		).toBe(401);
	});

	it('GET settlement answers 200 with the Proposed label, 404 with no mandate', async () => {
		const { agent, organisation } = await newAgent();
		const params = { agentId: agent.agentId };
		expect((await call('settlement', V.idValidator, { params, customer: customerA })).status).toBe(404);
		await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'mandate',
			issuerDid: organisation,
			mandate,
		});
		const view = await call('settlement', V.idValidator, { params, customer: customerA });
		expect(view).toMatchObject({ status: 200, body: { label: 'Proposed', readOnly: true } });
	});

	describe('customer B gets the same 404 for customer A resources, and nothing changes', () => {
		let target: { agentId: string; bindingId: string };
		beforeEach(async () => {
			const { agent, organisation } = await newAgent();
			await agents.grantAuthority(customerA, agent.agentId, {
				grantType: 'mandate',
				issuerDid: organisation,
				mandate,
			});
			const issued = await agents.bindPaymentAddress(customerA, agent.agentId, { account: account(1) });
			target = { agentId: agent.agentId, bindingId: issued.binding.id };
		});

		const routes: Array<
			[string, (t: { agentId: string; bindingId: string }) => Promise<{ status: number; body: unknown }>]
		> = [
			[
				'GET /agents/{id}/payment-addresses',
				(t) =>
					call('listPaymentAddresses', V.idValidator, {
						params: { agentId: t.agentId },
						customer: customerB,
					}),
			],
			[
				'POST /agents/{id}/payment-addresses',
				(t) =>
					call('bindPaymentAddress', V.bindPaymentAddressValidator, {
						params: { agentId: t.agentId },
						body: { account: account(7) },
						customer: customerB,
					}),
			],
			[
				'DELETE /agents/{id}/payment-addresses/{bindingId}',
				(t) =>
					call('revokePaymentAddress', V.revokePaymentAddressValidator, {
						params: t,
						customer: customerB,
					}),
			],
			[
				'GET /agents/{id}/settlement',
				(t) => call('settlement', V.idValidator, { params: { agentId: t.agentId }, customer: customerB }),
			],
		];

		it.each(routes)('%s', async (_name, run) => {
			const before = JSON.stringify([...store.bindings.values()]);
			const signs = world.signCalls.length;
			const result = await run(target);
			expect(result.status).toBe(404);
			expect(JSON.stringify(result.body)).not.toContain(customerA.customerId);
			expect(JSON.stringify([...store.bindings.values()])).toBe(before);
			expect(world.signCalls).toHaveLength(signs);
			// the same body as an agent that does not exist at all
			const unknown = await run({ ...target, agentId: '99999999-9999-4999-8999-999999999999' });
			expect(unknown.body).toEqual(result.body);
		});

		it("a binding id of customer A's agent used under customer B's own agent is a 404 too", async () => {
			const { agent: bAgent } = await newAgent(customerB);
			const result = await call('revokePaymentAddress', V.revokePaymentAddressValidator, {
				params: { agentId: bAgent.agentId, bindingId: target.bindingId },
				customer: customerB,
			});
			expect(result.status).toBe(404);
			expect([...store.bindings.values()][0]?.revokedAt).toBeNull();
		});
	});

	it('replays a bind with the same Idempotency-Key instead of binding twice', async () => {
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
		controller = new AgentController(
			() => ({ agents }),
			() => idempotency
		);
		const { agent } = await newAgent();
		const send = async () => {
			const request = {
				method: 'POST',
				body: { account: account(1) },
				params: { agentId: agent.agentId },
				query: {},
				headers: { 'idempotency-key': 'k1' },
				route: { path: '/agents/:agentId/payment-addresses' },
			} as unknown as Request;
			for (const validator of AgentController.bindPaymentAddressValidator) await validator.run(request);
			const out = { status: 0, body: undefined as unknown };
			const response = { locals: { customer: customerA } } as unknown as Response;
			response.status = ((code: number) => ((out.status = code), response)) as never;
			response.json = ((body: unknown) => ((out.body = body), response)) as never;
			response.setHeader = (() => response) as never;
			await controller.bindPaymentAddress(request, response);
			return out;
		};
		const first = await send();
		const second = await send();
		expect(first.status).toBe(201);
		expect(second).toEqual(first);
		expect(store.bindings.size).toBe(1);
	});
});
