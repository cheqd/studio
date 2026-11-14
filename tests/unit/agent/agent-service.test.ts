import { beforeEach, describe, expect, it } from '@jest/globals';
import { SDJwtInstance } from '@sd-jwt/core';
import { jwkVerifier, sha256Hasher } from '@cheqd/agent-identity-ap2';
import { AgentService } from '../../../src/services/agent/agent-service.js';
import { AgentServiceError } from '../../../src/services/agent/agent-errors.js';
import { decodeSdJwtUnverified } from '../../../src/services/agent/sd-jwt.js';
import { keysFromDidDocument } from '../../../src/services/agent/agent-keys.js';
import { customerA, customerB, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';
import type { IdentityEngine } from '../../../src/services/identity/engine/identity-engine.js';

let world: World;
let store: FakeStore;
let service: AgentService;
let kyaOs = false;
let engineFor: ReturnType<typeof newWorld>['engineFor'];

beforeEach(() => {
	const fresh = newWorld();
	world = fresh.world;
	store = fresh.store;
	engineFor = fresh.engineFor;
	kyaOs = false;
	service = new AgentService({ store, engineFor, kyaOsDelegationsEnabled: () => kyaOs, statusListSize: 4 });
});

async function statusOf(promise: Promise<unknown>) {
	try {
		await promise;
		return 200;
	} catch (error) {
		return error instanceof AgentServiceError ? error.status : 500;
	}
}

describe('register', () => {
	it('creates a dual-key DID (P-256 default, Ed25519 second) and the agent row', async () => {
		const agent = await service.register(customerA, { name: 'Booking agent', network: 'testnet' });
		const entry = world.dids.get(agent.did);
		expect(entry?.owner).toBe(customerA.customerId);
		const keys = keysFromDidDocument(entry?.doc as never);
		expect(keys.map((key) => key.alg)).toEqual(['ES256', 'EdDSA']);
		const methods = entry?.doc.verificationMethod as Array<{
			type: string;
			publicKeyJwk?: { crv: string };
			publicKeyMultibase?: string;
		}>;
		expect(methods[0]?.type).toBe('JsonWebKey2020');
		expect(methods[0]?.publicKeyJwk?.crv).toBe('P-256');
		expect(methods[1]?.type).toBe('Ed25519VerificationKey2020');
		expect(methods[1]?.publicKeyMultibase?.startsWith('z6Mk')).toBe(true);
		expect(entry?.doc.authentication).toEqual([`${agent.did}#key-1`, `${agent.did}#key-2`]);
		expect(agent).toMatchObject({ name: 'Booking agent', customerId: customerA.customerId, status: 'active' });
	});

	it('refuses an actsForDid that is not in the customer account, whoever owns it', async () => {
		const bOrganisation = await seedOrganisationDid(world, customerB);
		expect(
			await statusOf(service.register(customerA, { name: 'x', network: 'testnet', actsForDid: bOrganisation }))
		).toBe(404);
		expect(
			await statusOf(
				service.register(customerA, { name: 'x', network: 'testnet', actsForDid: 'did:cheqd:testnet:nope' })
			)
		).toBe(404);
		const own = await seedOrganisationDid(world, customerA);
		expect((await service.register(customerA, { name: 'x', network: 'testnet', actsForDid: own })).actsForDid).toBe(
			own
		);
	});

	it('needs a customer and a name', async () => {
		expect(await statusOf(service.register(undefined, { name: 'x', network: 'testnet' }))).toBe(401);
		expect(await statusOf(service.register(customerA, { name: '  ', network: 'testnet' }))).toBe(400);
	});

	it('answers 501 when the engine has none of the agent capabilities (the Veramo engine)', async () => {
		const veramoLike = new AgentService({
			store,
			engineFor: async () => ({ name: 'veramo' }) as unknown as IdentityEngine,
		});
		const agent = await service.register(customerA, { name: 'x', network: 'testnet' });
		expect(
			await statusOf(
				veramoLike.createCard(customerA, agent.agentId, { card: { endpoint: 'https://a.example/a2a' } })
			)
		).toBe(501);
		expect(
			await statusOf(
				veramoLike.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for', issuerDid: agent.did })
			)
		).toBe(501);
	});
});

describe('get, list, update, remove', () => {
	it('lists only the caller own agents', async () => {
		await service.register(customerA, { name: 'a1', network: 'testnet' });
		await service.register(customerA, { name: 'a2', network: 'testnet' });
		await service.register(customerB, { name: 'b1', network: 'testnet' });
		expect((await service.list(customerA, { limit: 10, offset: 0 })).total).toBe(2);
		expect((await service.list(customerB, { limit: 10, offset: 0 })).items.map((a) => a.agent.name)).toEqual([
			'b1',
		]);
	});

	it('updates name, description and status; rejects other statuses', async () => {
		const agent = await service.register(customerA, { name: 'a', network: 'testnet' });
		const updated = await service.update(customerA, agent.agentId, { name: 'renamed', status: 'suspended' });
		expect(updated).toMatchObject({ name: 'renamed', status: 'suspended' });
		expect(await statusOf(service.update(customerA, agent.agentId, { status: 'deleted' }))).toBe(400);
		expect(await statusOf(service.update(customerA, agent.agentId, {}))).toBe(400);
	});

	it('refuses cards for a suspended agent', async () => {
		const agent = await service.register(customerA, { name: 'a', network: 'testnet' });
		await service.update(customerA, agent.agentId, { status: 'suspended' });
		expect(
			await statusOf(
				service.createCard(customerA, agent.agentId, { card: { endpoint: 'https://a.example/a2a' } })
			)
		).toBe(409);
	});

	it('soft-deletes, revoking live grants first; the agent then answers 404', async () => {
		const organisation = await seedOrganisationDid(world, customerA);
		const agent = await service.register(customerA, { name: 'a', network: 'testnet', actsForDid: organisation });
		const { grant } = await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
		const result = await service.remove(customerA, agent.agentId);
		expect(result.revokedGrants).toBe(1);
		const list = world.lists.get(store.grants.get(grant.id)?.statusListUri as string);
		expect(list?.entries[grant.statusIndex as number]).toBe(1);
		expect(await statusOf(service.get(customerA, agent.agentId))).toBe(404);
	});

	it('does not delete the agent when a live grant cannot be revoked', async () => {
		const organisation = await seedOrganisationDid(world, customerA);
		const agent = await service.register(customerA, { name: 'a', network: 'testnet', actsForDid: organisation });
		await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
		const noRevocation = new AgentService({
			store,
			engineFor: async (customer) => {
				const engine = await engineFor(customer);
				return {
					name: 'credo',
					resolveDid: engine.resolveDid.bind(engine),
					setTokenStatus: undefined,
				} as unknown as IdentityEngine;
			},
		});
		expect(await statusOf(noRevocation.remove(customerA, agent.agentId))).toBe(501);
		expect((await service.get(customerA, agent.agentId)).status).toBe('active');
	});
});

describe('cross-tenant refusal: customer B against customer A agent returns 404 on every service method', () => {
	it.each([
		['get', (s: AgentService, id: string) => s.get(customerB, id)],
		['update', (s: AgentService, id: string) => s.update(customerB, id, { name: 'hijack' })],
		['remove', (s: AgentService, id: string) => s.remove(customerB, id)],
		[
			'createCard',
			(s: AgentService, id: string) =>
				s.createCard(customerB, id, { card: { endpoint: 'https://b.example/a2a' } }),
		],
		['getCard', (s: AgentService, id: string) => s.getCard(customerB, id)],
		[
			'grantAuthority',
			(s: AgentService, id: string) => s.grantAuthority(customerB, id, { grantType: 'tool-scope', tools: ['x'] }),
		],
		[
			'revokeAuthority',
			(s: AgentService, id: string) => s.revokeAuthority(customerB, id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
		],
	])('%s', async (_name, call) => {
		const organisation = await seedOrganisationDid(world, customerA);
		const agent = await service.register(customerA, { name: 'a', network: 'testnet', actsForDid: organisation });
		await service.createCard(customerA, agent.agentId, { card: { endpoint: 'https://a.example/a2a' } });
		const signedBefore = world.signCalls.length;
		const before = JSON.stringify([...store.agents.values()]);
		expect(await statusOf(call(service, agent.agentId))).toBe(404);
		expect(JSON.stringify([...store.agents.values()])).toBe(before);
		expect(store.cards).toHaveLength(1);
		expect(store.grants.size).toBe(0);
		expect(world.signCalls).toHaveLength(signedBefore);
	});

	it('does not let customer B revoke customer A grant through B own agent', async () => {
		const organisation = await seedOrganisationDid(world, customerA);
		const a = await service.register(customerA, { name: 'a', network: 'testnet', actsForDid: organisation });
		const b = await service.register(customerB, { name: 'b', network: 'testnet' });
		const { grant } = await service.grantAuthority(customerA, a.agentId, { grantType: 'acts-for' });
		expect(await statusOf(service.revokeAuthority(customerB, b.agentId, grant.id))).toBe(404);
		expect(store.grants.get(grant.id)?.revokedAt).toBeNull();
	});

	it("does not let a customer use another customer's DID as issuer", async () => {
		const bOrganisation = await seedOrganisationDid(world, customerB);
		const a = await service.register(customerA, { name: 'a', network: 'testnet' });
		expect(
			await statusOf(
				service.grantAuthority(customerA, a.agentId, { grantType: 'acts-for', issuerDid: bOrganisation })
			)
		).toBe(404);
		expect(world.signCalls).toHaveLength(0);
	});

	it('does not let a grant of one agent be revoked through another agent of the same customer', async () => {
		const organisation = await seedOrganisationDid(world, customerA);
		const a1 = await service.register(customerA, { name: 'a1', network: 'testnet', actsForDid: organisation });
		const a2 = await service.register(customerA, { name: 'a2', network: 'testnet', actsForDid: organisation });
		const { grant } = await service.grantAuthority(customerA, a1.agentId, { grantType: 'acts-for' });
		expect(await statusOf(service.revokeAuthority(customerA, a2.agentId, grant.id))).toBe(404);
	});

	it('every store call carries a customer id', async () => {
		const organisation = await seedOrganisationDid(world, customerA);
		const agent = await service.register(customerA, { name: 'a', network: 'testnet', actsForDid: organisation });
		await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
		await service.createCard(customerA, agent.agentId, { card: { endpoint: 'https://a.example/a2a' } });
		await service.remove(customerA, agent.agentId);
		expect(store.calls.length).toBeGreaterThan(8);
		expect(store.calls.every((call) => call.customerId === customerA.customerId)).toBe(true);
	});
});

describe('authority grants', () => {
	async function setup() {
		const organisation = await seedOrganisationDid(world, customerA);
		const agent = await service.register(customerA, { name: 'a', network: 'testnet', actsForDid: organisation });
		return { organisation, agent };
	}

	it('issues an acts-for SD-JWT VC signed by the organisation key, with a Token Status List entry', async () => {
		const { organisation, agent } = await setup();
		const { grant, credential } = await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
		expect(credential.format).toBe('sd-jwt-vc');
		const decoded = decodeSdJwtUnverified(credential.value as string);
		expect(decoded?.header).toMatchObject({ typ: 'dc+sd-jwt', alg: 'EdDSA', kid: `${organisation}#key-1` });
		expect(decoded?.payload).toMatchObject({
			iss: organisation,
			sub: agent.did,
			vct: 'https://cheqd.io/vct/agent-acts-for/v1',
		});
		const statusList = (decoded?.payload.status as { status_list: { uri: string; idx: number } }).status_list;
		expect(statusList.idx).toBe(grant.statusIndex);
		expect(world.lists.has(statusList.uri)).toBe(true);

		const issuerJwk = keysFromDidDocument(world.dids.get(organisation)?.doc as never)[0]?.jwk as Record<
			string,
			unknown
		>;
		const verified = await new SDJwtInstance<Record<string, unknown>>({
			verifier: jwkVerifier(issuerJwk),
			hasher: sha256Hasher,
		}).verify(credential.value as string);
		expect(verified.payload.sub).toBe(agent.did);
	});

	it('hands out consecutive indexes and opens a new list when one is full', async () => {
		const { agent } = await setup();
		const indexes: number[] = [];
		const uris = new Set<string>();
		for (let i = 0; i < 5; i++) {
			const { grant } = await service.grantAuthority(customerA, agent.agentId, {
				grantType: 'tool-scope',
				tools: ['search'],
			});
			indexes.push(grant.statusIndex as number);
			uris.add(store.grants.get(grant.id)?.statusListUri as string);
		}
		expect(indexes).toEqual([0, 1, 2, 3, 0]);
		expect(uris.size).toBe(2);
	});

	it('revokes by setting the list entry to 1; revoking again changes nothing', async () => {
		const { agent } = await setup();
		const { grant } = await service.grantAuthority(customerA, agent.agentId, {
			grantType: 'tool-scope',
			tools: ['search', 'book'],
		});
		const revoked = await service.revokeAuthority(customerA, agent.agentId, grant.id);
		expect(revoked.revokedAt).toBeInstanceOf(Date);
		const list = world.lists.get(revoked.statusListUri as string);
		expect(list?.entries[grant.statusIndex as number]).toBe(1);
		const again = await service.revokeAuthority(customerA, agent.agentId, grant.id);
		expect(again.revokedAt).toEqual(revoked.revokedAt);
	});

	it('validates tool scopes and expiry before using a key or taking an index', async () => {
		const { agent } = await setup();
		expect(
			await statusOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'tool-scope', tools: [] }))
		).toBe(400);
		expect(
			await statusOf(
				service.grantAuthority(customerA, agent.agentId, {
					grantType: 'acts-for',
					expiresAt: '2001-01-01T00:00:00Z',
				})
			)
		).toBe(400);
		expect(world.signCalls).toHaveLength(0);
		expect([...store.lists.values()].every((list) => list.writeCursor === 0)).toBe(true);
	});

	it('needs an issuer DID when the agent has no actsForDid', async () => {
		const bare = await service.register(customerA, { name: 'bare', network: 'testnet' });
		expect(await statusOf(service.grantAuthority(customerA, bare.agentId, { grantType: 'acts-for' }))).toBe(400);
	});

	describe('one live acts-for grant per agent', () => {
		const codeOf = async (promise: Promise<unknown>) => {
			try {
				await promise;
				return 'ok';
			} catch (error) {
				return error instanceof AgentServiceError ? `${error.status} ${error.code}` : 'other';
			}
		};

		it('refuses a second acts-for grant with 409 acts_for_exists, and uses no key or index for it', async () => {
			const { agent } = await setup();
			await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
			const signed = world.signCalls.length;
			expect(await codeOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' }))).toBe(
				'409 acts_for_exists'
			);
			expect(world.signCalls).toHaveLength(signed);
			expect([...store.grants.values()].filter((g) => g.grantType === 'acts-for')).toHaveLength(1);
		});

		it('lets only one of two concurrent requests through', async () => {
			const { agent } = await setup();
			const results = await Promise.all([
				codeOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' })),
				codeOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' })),
			]);
			expect([...results].sort()).toEqual(['409 acts_for_exists', 'ok']);
			expect([...store.grants.values()].filter((g) => g.grantType === 'acts-for')).toHaveLength(1);
		});

		it('allows another acts-for grant once the first is revoked, and other grant types alongside', async () => {
			const { agent } = await setup();
			const first = await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
			await service.grantAuthority(customerA, agent.agentId, { grantType: 'tool-scope', tools: ['search'] });
			await service.revokeAuthority(customerA, agent.agentId, first.grant.id);
			expect(await codeOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' }))).toBe(
				'ok'
			);
		});

		it('counts a suspended agent grant as live, but not an expired one', async () => {
			const { agent } = await setup();
			const first = await service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
			await service.update(customerA, agent.agentId, { status: 'suspended' });
			await service.update(customerA, agent.agentId, { status: 'active' });
			expect(await codeOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' }))).toBe(
				'409 acts_for_exists'
			);
			const stored = store.grants.get(first.grant.id);
			if (stored) stored.expiresAt = new Date(Date.now() - 1000);
			expect(await codeOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' }))).toBe(
				'ok'
			);
		});
	});

	describe('platform maximum lifetime on a new grant', () => {
		const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

		it('refuses an expiry beyond 365 days with 400 and takes nothing', async () => {
			const { agent } = await setup();
			expect(
				await statusOf(
					service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for', expiresAt: days(366) })
				)
			).toBe(400);
			expect(world.signCalls).toHaveLength(0);
			expect(
				await statusOf(
					service.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for', expiresAt: days(364) })
				)
			).toBe(200);
		});

		it('honours the configured maximum', async () => {
			const { agent } = await setup();
			const short = new AgentService({ store, engineFor, statusListSize: 4, maxGrantLifetimeDays: () => 30 });
			expect(
				await statusOf(
					short.grantAuthority(customerA, agent.agentId, {
						grantType: 'tool-scope',
						tools: ['a'],
						expiresAt: days(31),
					})
				)
			).toBe(400);
			expect(
				await statusOf(
					short.grantAuthority(customerA, agent.agentId, {
						grantType: 'tool-scope',
						tools: ['a'],
						expiresAt: days(29),
					})
				)
			).toBe(200);
		});
	});

	describe('AP2 open mandate (single hop)', () => {
		const mandate = {
			type: 'payment',
			constraints: [{ type: 'payment.amount_range', currency: 'USD', max: 5000 }],
		};

		it('is an SD-JWT VC bound to the agent P-256 key', async () => {
			const { organisation, agent } = await setup();
			const { credential } = await service.grantAuthority(customerA, agent.agentId, {
				grantType: 'mandate',
				mandate,
			});
			const decoded = decodeSdJwtUnverified(credential.value as string);
			const agentKeys = keysFromDidDocument(world.dids.get(agent.did)?.doc as never);
			expect(decoded?.payload).toMatchObject({
				iss: organisation,
				sub: agent.did,
				vct: 'mandate.payment.open.1',
				constraints: mandate.constraints,
			});
			expect((decoded?.payload.cnf as { jwk: unknown }).jwk).toEqual(agentKeys[0]?.jwk);
		});

		it.each([
			['a sub-agent to delegate to', { ...mandate, delegateTo: 'did:cheqd:testnet:sub' }],
			['a delegation chain', { ...mandate, delegationChain: [] }],
			['a parent mandate', { ...mandate, parentMandate: 'x' }],
			['a caller-chosen key binding', { ...mandate, cnf: { jwk: {} } }],
			['an unknown field', { ...mandate, extra: true }],
			['an unknown constraint', { type: 'payment', constraints: [{ type: 'payment.delegate_to_subagent' }] }],
			[
				'a checkout constraint on a payment mandate',
				{ type: 'payment', constraints: [{ type: 'checkout.allowed_merchants', allowed: [{ name: 'x' }] }] },
			],
			[
				'a malformed amount range',
				{ type: 'payment', constraints: [{ type: 'payment.amount_range', currency: 'usd', max: -1 }] },
			],
			['no constraints', { type: 'payment', constraints: [] }],
		])('refuses %s', async (_label, bad) => {
			const { agent } = await setup();
			expect(
				await statusOf(service.grantAuthority(customerA, agent.agentId, { grantType: 'mandate', mandate: bad }))
			).toBe(400);
			expect(world.signCalls).toHaveLength(0);
		});
	});

	describe('KYA-OS delegation (gated, untested)', () => {
		it('is refused while the flag is off', async () => {
			const { agent } = await setup();
			expect(
				await statusOf(
					service.grantAuthority(customerA, agent.agentId, { grantType: 'delegation', scopes: ['read'] })
				)
			).toBe(403);
		});

		it('is issued, labelled untested, with no status entry when the flag is on', async () => {
			kyaOs = true;
			const { agent } = await setup();
			const issued = await service.grantAuthority(customerA, agent.agentId, {
				grantType: 'delegation',
				scopes: ['read'],
			});
			expect(issued.label).toBe('untested');
			expect(issued.grant.statusListId).toBeNull();
			const revoked = await service.revokeAuthority(customerA, agent.agentId, issued.grant.id);
			expect(revoked.revokedAt).toBeInstanceOf(Date);
		});
	});
});
