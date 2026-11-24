import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AgentController } from '../../../src/controllers/api/agent.js';
import { AgentService } from '../../../src/services/agent/agent-service.js';
import { customerA, customerB, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';

// U-01 / U-02: Studio keeps the authority credentials it issues to agents and serves them to the owner only.

const V = AgentController;
const ZERO = '00000000-0000-4000-8000-000000000000';
const ADDRESS = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const NOT_FOUND_BODY = { error: 'Agent not found', code: 'not_found' };

let world: World;
let store: FakeStore;
let agents: AgentService;
let controller: AgentController;
let now = new Date('2026-11-20T10:00:00Z');

beforeEach(() => {
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
		kyaOsDelegationsEnabled: () => true,
	});
	controller = new AgentController(() => ({ agents }));
});

async function call(
	handler: keyof AgentController,
	validators: Array<{ run: (req: Request) => Promise<unknown> }>,
	params: Record<string, string>,
	customer: unknown = customerA
) {
	const request = { method: 'GET', body: {}, params, query: {}, headers: {} } as unknown as Request;
	for (const validator of validators) await validator.run(request);
	const out = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
	const response = { locals: { customer } } as unknown as Response;
	response.status = ((code: number) => ((out.statusCode = code), response)) as never;
	response.json = ((body: unknown) => ((out.body = body), response)) as never;
	response.setHeader = ((name: string, value: string) => ((out.headers[name] = value), response)) as never;
	await (controller[handler] as (req: Request, res: Response) => Promise<unknown>)(request, response);
	return { status: out.statusCode, body: out.body as Record<string, any>, headers: out.headers };
}

const download = (agentId: string, grantId: string, customer: unknown = customerA) =>
	call('getAuthorityCredential', V.grantCredentialValidator, { agentId, grantId }, customer);
const downloadBinding = (agentId: string, bindingId: string, customer: unknown = customerA) =>
	call('getPaymentAddressCredential', V.bindingCredentialValidator, { agentId, bindingId }, customer);

async function newAgent(customer = customerA) {
	const organisation = await seedOrganisationDid(world, customer);
	const agent = await agents.register(customer, { name: 'bot', network: 'testnet', actsForDid: organisation });
	return { agent, organisation };
}

describe('GET /agents/{agentId}/authority/{grantId}/credential', () => {
	it('gives the owner the credential exactly as issued, with no-store, and marks the grant hasCredential', async () => {
		const { agent } = await newAgent();
		const issued = await agents.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
		const result = await download(agent.agentId, issued.grant.id);
		expect(result.status).toBe(200);
		expect(result.headers['Cache-Control']).toBe('no-store');
		expect(result.body).toMatchObject({
			grantId: issued.grant.id,
			credential: { format: 'sd-jwt-vc', value: issued.credential.value },
			supersedes: null,
		});
		expect(typeof result.body.id).toBe('string');
		expect(result.body.issuedAt).toBeInstanceOf(Date);

		const list = await call('listAuthority', V.idValidator, { agentId: agent.agentId });
		expect(list.body.grants).toEqual([expect.objectContaining({ id: issued.grant.id, hasCredential: true })]);
	});

	it('is 404 not_found for another customer, through their agent or mine, with the same body as an unknown grant', async () => {
		const mine = await newAgent();
		const theirs = await newAgent(customerB);
		const theirGrant = await agents.grantAuthority(customerB, theirs.agent.agentId, { grantType: 'acts-for' });
		await agents.grantAuthority(customerA, mine.agent.agentId, { grantType: 'acts-for' });

		const otherAgent = await download(theirs.agent.agentId, theirGrant.grant.id);
		const crossGrant = await download(mine.agent.agentId, theirGrant.grant.id);
		const unknown = await download(mine.agent.agentId, ZERO);
		expect(otherAgent.status).toBe(404);
		expect(otherAgent.body).toEqual(NOT_FOUND_BODY);
		expect(otherAgent.headers['Cache-Control']).toBe('no-store');
		expect(crossGrant.status).toBe(404);
		expect(crossGrant.body).toEqual(unknown.body);
		expect(unknown.body.code).toBe('not_found');
		// No call ever reached customer B's stored credentials with customer A's id
		expect(JSON.stringify([otherAgent.body, crossGrant.body])).not.toContain(String(theirGrant.credential.value));
	});

	it('answers 400 for ids that are not UUIDs and 401 without a customer', async () => {
		const { agent } = await newAgent();
		expect((await download('nope', ZERO)).status).toBe(400);
		expect((await download(agent.agentId, 'nope')).status).toBe(400);
		expect((await download(agent.agentId, ZERO, null)).status).toBe(401);
	});

	it('reports a grant made before credentials were kept as hasCredential false and 404 credential_not_stored', async () => {
		const { agent, organisation } = await newAgent();
		const legacy = await store.createGrant({
			agentId: agent.agentId,
			customerId: customerA.customerId,
			grantType: 'acts-for',
			issuerDid: organisation,
			subjectDid: agent.did,
			format: 'sd-jwt-vc',
			vct: 'x',
		});
		const list = await call('listAuthority', V.idValidator, { agentId: agent.agentId });
		expect(list.body.grants).toEqual([expect.objectContaining({ id: legacy.id, hasCredential: false })]);
		const result = await download(agent.agentId, legacy.id);
		expect(result.status).toBe(404);
		expect(result.body.code).toBe('credential_not_stored');
	});

	it('stores the replacement when an expiry change reissues, and marks the old copy superseded', async () => {
		const { agent } = await newAgent();
		const issued = await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'tool-scope',
			tools: ['search'],
			expiresAt: '2026-12-01T00:00:00Z',
		});
		const first = await download(agent.agentId, issued.grant.id);
		const changed = await agents.changeGrantExpiry(customerA, agent.agentId, issued.grant.id, {
			expiresAt: '2027-03-01T00:00:00Z',
		});
		const second = await download(agent.agentId, issued.grant.id);
		expect(second.status).toBe(200);
		expect(second.body.credential.value).toBe(changed.credential.value);
		expect(second.body.credential.value).not.toBe(issued.credential.value);
		expect(second.body.supersedes).toBe(first.body.id);

		const rows = store.storedCredentials.filter((row) => row.grantId === issued.grant.id);
		expect(rows).toHaveLength(2);
		const old = rows.find((row) => row.id === first.body.id);
		expect(old?.supersededAt).toBeInstanceOf(Date);
		expect(old?.supersededBy).toBe(second.body.id);
		expect(rows.filter((row) => !row.supersededAt)).toHaveLength(1);

		const list = await call('listAuthority', V.idValidator, { agentId: agent.agentId });
		expect(list.body.grants[0]).toMatchObject({ id: issued.grant.id, hasCredential: true });
	});

	it('keeps a revoked grant downloadable (the status list says it is revoked)', async () => {
		const { agent } = await newAgent();
		const issued = await agents.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
		await agents.revokeAuthority(customerA, agent.agentId, issued.grant.id);
		const result = await download(agent.agentId, issued.grant.id);
		expect(result.status).toBe(200);
		expect(result.body.credential.value).toBe(issued.credential.value);
	});

	it('stores a KYA-OS delegation as issued (JWT)', async () => {
		const { agent } = await newAgent();
		const issued = await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'delegation',
			scopes: ['read'],
		});
		const result = await download(agent.agentId, issued.grant.id);
		expect(result.status).toBe(200);
		expect(result.body.credential).toEqual({ format: 'jwt', value: issued.credential.value });
	});
});

describe('GET /agents/{agentId}/payment-addresses/{bindingId}/credential', () => {
	it('gives the owner the binding credential, marks it hasCredential, and is 404 for another customer', async () => {
		const { agent } = await newAgent();
		const issued = await agents.bindPaymentAddress(customerA, agent.agentId, {
			account: `eip155:8453:${ADDRESS}`,
		});
		const mine = await downloadBinding(agent.agentId, issued.binding.id);
		expect(mine.status).toBe(200);
		expect(mine.headers['Cache-Control']).toBe('no-store');
		expect(mine.body).toMatchObject({
			bindingId: issued.binding.id,
			credential: { format: 'sd-jwt-vc', value: issued.credential.value },
		});
		const list = await call('listPaymentAddresses', V.idValidator, { agentId: agent.agentId });
		expect(list.body.paymentAddresses).toEqual([
			expect.objectContaining({ id: issued.binding.id, hasCredential: true }),
		]);

		const theirs = await downloadBinding(agent.agentId, issued.binding.id, customerB);
		expect(theirs.status).toBe(404);
		expect(theirs.body).toEqual(NOT_FOUND_BODY);
	});
});
