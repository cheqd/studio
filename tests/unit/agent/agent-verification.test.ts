import { sign as cryptoSign } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SDJwtInstance } from '@sd-jwt/core';
import { sha256Hasher, transactionDataHash } from '@cheqd/agent-identity-ap2';
import { AgentService } from '../../../src/services/agent/agent-service.js';
import { AgentVerificationService, verdictOf } from '../../../src/services/agent/agent-verification-service.js';
import { AgentServiceError } from '../../../src/services/agent/agent-errors.js';
import { resolveDidKeys } from '../../../src/services/agent/agent-engine.js';
import { customerA, customerB, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';
import type { IdentityEngine } from '../../../src/services/identity/engine/identity-engine.js';

let world: World;
let store: FakeStore;
let agents: AgentService;
let verification: AgentVerificationService;
let engine: IdentityEngine;
let engineFor: ReturnType<typeof newWorld>['engineFor'];

beforeEach(async () => {
	jest.spyOn(console, 'debug').mockImplementation(() => undefined);
	const fresh = newWorld();
	world = fresh.world;
	store = fresh.store;
	engineFor = fresh.engineFor;
	engine = await engineFor(customerA);
	agents = new AgentService({ store, engineFor });
	verification = new AgentVerificationService({ store, engineFor });
});

async function setup() {
	const organisation = await seedOrganisationDid(world, customerA);
	const agent = await agents.register(customerA, {
		name: 'Verified agent',
		network: 'testnet',
		actsForDid: organisation,
	});
	const card = await agents.createCard(customerA, agent.agentId, {
		card: { endpoint: 'https://agent.example/a2a' },
		publish: true,
	});
	const acts = await agents.grantAuthority(customerA, agent.agentId, { grantType: 'acts-for' });
	return { organisation, agent, card, acts };
}

const mandateRequest = { type: 'payment', constraints: [{ type: 'payment.amount_range', currency: 'USD', max: 5000 }] };
const closed = {
	vct: 'mandate.payment.1',
	transaction_id: 'tx-1',
	payee: { id: 'm1', name: 'Acme' },
	payment_amount: { amount: 100, currency: 'USD' },
	payment_instrument: { id: 'c', type: 'card' },
};

async function presentMandate(agentDid: string, token: string) {
	const key = (await resolveDidKeys(engine, agentDid)).keys[0];
	const privateKey = world.privateKeyFor(key?.jwk as never);
	return new SDJwtInstance<Record<string, unknown>>({
		hasher: sha256Hasher,
		saltGenerator: () => 'salt',
		kbSigner: (data: string) =>
			cryptoSign('sha256', Buffer.from(data) as never, { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString(
				'base64url'
			),
		kbSignAlg: 'ES256',
	}).present(token, undefined, {
		kb: {
			payload: {
				iat: Math.floor(Date.now() / 1000),
				aud: 'did:web:merchant.example',
				nonce: 'n-1',
				transaction_data: [transactionDataHash(closed)],
			} as never,
		},
	});
}

describe('POST /verify/agent: the four-call contract', () => {
	it('passes all four calls for a registered agent with a published card, a live credential and a live mandate', async () => {
		const { agent, acts } = await setup();
		const mandate = await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'mandate',
			mandate: mandateRequest,
		});
		const result = await verification.verify(customerA, {
			did: agent.did,
			credentials: [acts.credential.value as string],
			mandate: {
				presentation: await presentMandate(agent.did, mandate.credential.value as string),
				audience: 'did:web:merchant.example',
				nonce: 'n-1',
				closedMandate: closed,
			},
		});
		expect(result.verdict).toBe('verified');
		expect(Object.keys(result.checks)).toEqual(['resolveAgent', 'verifyAgentCard', 'checkStatus', 'verifyMandate']);
		expect(Object.values(result.checks).map((check) => check?.outcome)).toEqual(['pass', 'pass', 'pass', 'pass']);
		expect(result.checks.resolveAgent?.details?.cardResource).toMatchObject({ resourceId: expect.any(String) });
	});

	it('runs only the checks asked for, and skips verifyMandate when no mandate is presented', async () => {
		const { agent } = await setup();
		const only = await verification.verify(customerA, { did: agent.did, checks: ['resolveAgent'] });
		expect(Object.keys(only.checks)).toEqual(['resolveAgent']);
		const skipped = await verification.verify(customerA, { did: agent.did, checks: ['verifyMandate'] });
		expect(skipped.checks.verifyMandate).toMatchObject({ outcome: 'skipped', reasons: ['no_mandate_presented'] });
		expect(skipped.verdict).toBe('inconclusive');
	});

	it('fails checkStatus once the credential is revoked, and says why', async () => {
		const { agent, acts } = await setup();
		await agents.revokeAuthority(customerA, agent.agentId, acts.grant.id);
		const result = await verification.verify(customerA, {
			did: agent.did,
			credentials: [acts.credential.value as string],
		});
		expect(result.verdict).toBe('failed');
		expect(result.checks.checkStatus).toMatchObject({ outcome: 'fail', reasons: ['credential_0_revoked'] });
	});

	it('fails a suspended credential', async () => {
		const { agent, acts } = await setup();
		const list = world.lists.get(store.grants.get(acts.grant.id)?.statusListUri as string);
		(list?.entries as number[])[acts.grant.statusIndex as number] = 2;
		const result = await verification.verify(customerA, {
			did: agent.did,
			credentials: [acts.credential.value as string],
		});
		expect(result.checks.checkStatus?.reasons).toEqual(['credential_0_suspended']);
	});

	it('does not call a credential live when its status list cannot be read (fails closed: inconclusive, never verified)', async () => {
		const { agent, acts } = await setup();
		world.unverifiableLists.add(store.grants.get(acts.grant.id)?.statusListUri as string);
		const result = await verification.verify(customerA, {
			did: agent.did,
			credentials: [acts.credential.value as string],
		});
		expect(result.checks.checkStatus).toMatchObject({ outcome: 'error', reasons: ['credential_0_unverifiable'] });
		expect(result.verdict).toBe('inconclusive');
	});

	it('fails a credential presented for a different agent, even though it is genuine', async () => {
		const { agent, acts } = await setup();
		const other = await agents.register(customerA, { name: 'other', network: 'testnet' });
		const result = await verification.verify(customerA, {
			did: other.did,
			credentials: [acts.credential.value as string],
		});
		expect(result.checks.checkStatus?.reasons).toEqual(['credential_0_subject_is_not_this_agent']);
		expect(agent.did).not.toBe(other.did);
	});

	it('fails a forged credential', async () => {
		const { agent, acts } = await setup();
		const [jwt, rest] = (acts.credential.value as string).split('~');
		const parts = (jwt as string).split('.');
		const payload = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString());
		payload.vct = 'https://cheqd.io/vct/something-else';
		const forged = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}~${rest}`;
		const result = await verification.verify(customerA, { did: agent.did, credentials: [forged] });
		expect(result.checks.checkStatus?.reasons).toEqual(['credential_0_signature_or_expiry_invalid']);
	});

	it('fails the card check for a card edited after signing, and for a card anchored to another DID', async () => {
		const { agent, card } = await setup();
		const edited = { ...card.card, name: 'Evil' };
		expect(
			(await verification.verify(customerA, { did: agent.did, checks: ['verifyAgentCard'], card: edited })).checks
				.verifyAgentCard?.outcome
		).toBe('fail');
		const other = await agents.register(customerA, { name: 'other', network: 'testnet' });
		const moved = await verification.verify(customerA, {
			did: other.did,
			checks: ['verifyAgentCard'],
			card: card.card,
		});
		expect(moved.checks.verifyAgentCard?.outcome).toBe('fail');
	});

	it('fails the card check when there is no card to check', async () => {
		const agent = await agents.register(customerA, { name: 'bare', network: 'testnet' });
		const result = await verification.verify(customerA, { did: agent.did, checks: ['verifyAgentCard'] });
		expect(result.checks.verifyAgentCard).toMatchObject({
			outcome: 'fail',
			reasons: ['no_card_published_or_presented'],
		});
	});

	it('fails every check for a deactivated or unknown DID', async () => {
		const { agent } = await setup();
		(world.dids.get(agent.did) as { deactivated: boolean }).deactivated = true;
		const deactivated = await verification.verify(customerA, {
			did: agent.did,
			checks: ['resolveAgent', 'verifyAgentCard', 'checkStatus'],
		});
		expect(Object.values(deactivated.checks).every((check) => check?.reasons.includes('did_deactivated'))).toBe(
			true
		);
		const unknown = await verification.verify(customerA, {
			did: 'did:cheqd:testnet:00000000-0000-4000-8000-000000000000',
			checks: ['resolveAgent'],
		});
		expect(unknown.checks.resolveAgent).toMatchObject({ outcome: 'fail', reasons: ['did_unresolvable'] });
		expect(unknown.verdict).toBe('failed');
	});

	it('fails a mandate that is revoked, over its cap, or presented for another agent', async () => {
		const { agent } = await setup();
		const mandate = await agents.grantAuthority(customerA, agent.agentId, {
			grantType: 'mandate',
			mandate: mandateRequest,
		});
		const presentation = await presentMandate(agent.did, mandate.credential.value as string);
		const input = { presentation, audience: 'did:web:merchant.example', nonce: 'n-1', closedMandate: closed };
		expect(
			(await verification.verify(customerA, { did: agent.did, checks: ['verifyMandate'], mandate: input }))
				.verdict
		).toBe('verified');

		const overspend = { ...closed, payment_amount: { amount: 99999, currency: 'USD' } };
		const over = await verification.verify(customerA, {
			did: agent.did,
			checks: ['verifyMandate'],
			mandate: { ...input, closedMandate: overspend },
		});
		expect(over.checks.verifyMandate?.outcome).toBe('fail');

		const other = await agents.register(customerA, { name: 'other', network: 'testnet' });
		const wrongAgent = await verification.verify(customerA, {
			did: other.did,
			checks: ['verifyMandate'],
			mandate: input,
		});
		expect(wrongAgent.checks.verifyMandate?.reasons).toEqual(['mandate_subject_is_not_this_agent']);

		await agents.revokeAuthority(customerA, agent.agentId, mandate.grant.id);
		const revoked = await verification.verify(customerA, {
			did: agent.did,
			checks: ['verifyMandate'],
			mandate: input,
		});
		expect(revoked.checks.verifyMandate?.reasons).toContain('mandate_revoked');
		expect(revoked.verdict).toBe('failed');
	});

	it('rejects a did that is not did:cheqd and an unknown check name', async () => {
		const status = async (promise: Promise<unknown>) =>
			promise.then(
				() => 200,
				(e) => (e instanceof AgentServiceError ? e.status : 500)
			);
		expect(await status(verification.verify(customerA, { did: 'did:web:agent.example' }))).toBe(400);
		expect(
			await status(
				verification.verify(customerA, {
					did: 'did:cheqd:testnet:abcdefabcdefabcdefabcdef',
					checks: ['nope' as never],
				})
			)
		).toBe(400);
		expect(
			await status(verification.verify(undefined, { did: 'did:cheqd:testnet:abcdefabcdefabcdefabcdef' }))
		).toBe(401);
	});
});

describe('verificationEvent', () => {
	it('is written once per call with outcomes and reason codes only, under the verifier', async () => {
		const { agent, acts } = await setup();
		const result = await verification.verify(customerB, {
			did: agent.did,
			credentials: [acts.credential.value as string],
		});
		expect(result.eventId).toBeTruthy();
		expect(store.events).toHaveLength(1);
		const event = store.events[0];
		expect(event).toMatchObject({
			customerId: customerB.customerId,
			subjectDid: agent.did,
			verdict: 'verified',
			engine: 'credo',
		});
		const stored = JSON.stringify(event?.checks);
		expect(stored).not.toContain(acts.credential.value as string);
		expect(stored).not.toContain('Verified agent');
		expect(Object.keys(event?.checks ?? {})).toEqual(['resolveAgent', 'verifyAgentCard', 'checkStatus']);
	});

	it('does not lose the verdict when the event cannot be written', async () => {
		const { agent } = await setup();
		store.failEvents = true;
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const result = await verification.verify(customerA, { did: agent.did });
		expect(result.verdict).toBe('verified');
		expect(result.eventId).toBeNull();
	});

	it('another customer can verify the agent but reads nothing of the owner: no tenant-scoped store call, no ids in the result', async () => {
		const { agent } = await setup();
		const callsBefore = store.calls.length;
		const result = await verification.verify(customerB, { did: agent.did });
		expect(result.verdict).toBe('verified');
		const text = JSON.stringify(result);
		expect(text).not.toContain(agent.agentId);
		expect(text).not.toContain(customerA.customerId);
		expect(store.calls).toHaveLength(callsBefore);
	});
});

describe('verdict', () => {
	it.each([
		[['pass', 'pass'], 'verified'],
		[['pass', 'skipped'], 'verified'],
		[['pass', 'error'], 'inconclusive'],
		[['pass', 'fail', 'error'], 'failed'],
		[['skipped'], 'inconclusive'],
		[[], 'inconclusive'],
	])('%j is %s', (outcomes, verdict) => {
		expect(verdictOf(outcomes.map((outcome) => ({ outcome: outcome as never, reasons: [] })))).toBe(verdict);
	});
});
