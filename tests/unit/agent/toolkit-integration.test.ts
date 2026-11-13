import { createPublicKey, sign as cryptoSign } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SDJwtInstance } from '@sd-jwt/core';
import { canonicalizeAgentCard, verifyAgentCardSignature } from '@a2a-js/sdk';
import type { AgentCard } from '@a2a-js/sdk';
import { createRetrievePublicKey } from '@cheqd/agent-identity';
import { sha256Hasher, transactionDataHash } from '@cheqd/agent-identity-ap2';
import { AgentService } from '../../../src/services/agent/agent-service.js';
import {
	CHEQD_TRUST_EXTENSION_URI,
	buildAgentCard,
	signAgentCard,
	verifyAgentCardForDid,
} from '../../../src/services/agent/agent-card.js';
import { validateOpenMandateRequest, verifyOpenMandate } from '../../../src/services/agent/ap2-mandate.js';
import { didSigner, resolveDidKeys } from '../../../src/services/agent/agent-engine.js';
import { issueSdJwtVc } from '../../../src/services/agent/sd-jwt.js';
import { customerA, newWorld, seedOrganisationDid } from './fakes.js';
import type { FakeStore, World } from './fakes.js';
import type { IdentityEngine } from '../../../src/services/identity/engine/identity-engine.js';

let world: World;
let store: FakeStore;
let service: AgentService;
let engine: IdentityEngine;

beforeEach(async () => {
	// The SDK logs every failed signature entry (with the card) at debug level.
	jest.spyOn(console, 'debug').mockImplementation(() => undefined);
	const fresh = newWorld();
	world = fresh.world;
	store = fresh.store;
	engine = await fresh.engineFor(customerA);
	service = new AgentService({ store, engineFor: fresh.engineFor });
});

const resolver = (did: string) => engine.resolveDid(did).then((resolution) => resolution.didDocument);

describe('A2A agent card (toolkit key resolver + @a2a-js/sdk)', () => {
	async function agentWithCard(publish = false) {
		const agent = await service.register(customerA, {
			name: 'Travel agent',
			description: 'Books trips',
			network: 'testnet',
		});
		const created = await service.createCard(customerA, agent.agentId, {
			card: {
				endpoint: 'https://agent.example/a2a',
				skills: [{ id: 'book', name: 'Book a trip', tags: ['travel'] }],
			},
			publish,
		});
		return { agent, created };
	}

	it('builds a card anchored to the agent DID by the cheqd trust extension', async () => {
		const agent = await service.register(customerA, { name: 'Travel agent', network: 'testnet' });
		const card = buildAgentCard(agent, { endpoint: 'https://agent.example/a2a' }) as unknown as {
			name: string;
			capabilities: { extensions: Array<{ uri: string; params: { anchoredDid: string } }> };
			supportedInterfaces: Array<{ url: string; protocolBinding: string }>;
		};
		expect(card.name).toBe('Travel agent');
		expect(card.supportedInterfaces[0]).toMatchObject({
			url: 'https://agent.example/a2a',
			protocolBinding: 'JSONRPC',
		});
		expect(card.capabilities.extensions[0]).toMatchObject({
			uri: CHEQD_TRUST_EXTENSION_URI,
			params: { anchoredDid: agent.did },
		});
	});

	it('is signed with the P-256 key and verifies with the toolkit resolver and the SDK verifier', async () => {
		const { agent, created } = await agentWithCard();
		expect(created.version).toBe(1);
		const signature = (created.card as { signatures: Array<{ protected: string; signature: string }> })
			.signatures[0];
		const header = JSON.parse(Buffer.from(signature?.protected as string, 'base64url').toString());
		expect(header).toEqual({ alg: 'ES256', kid: `${agent.did}#key-1`, typ: 'JOSE' });
		expect(created.jws).toBe(`${signature?.protected}..${signature?.signature}`);

		// Independently of Studio's own check: the toolkit resolver, pinned to the agent DID, and the SDK verifier.
		const retrieve = createRetrievePublicKey({
			expectedDid: agent.did,
			resolveDidCheqd: async (did) => (await resolver(did)) as never,
		});
		await expect(verifyAgentCardSignature(retrieve)(created.card as unknown as AgentCard)).resolves.toBeUndefined();
	});

	it('can be signed with the Ed25519 key instead', async () => {
		const agent = await service.register(customerA, { name: 'a', network: 'testnet' });
		const created = await service.createCard(customerA, agent.agentId, {
			card: { endpoint: 'https://a.example/a2a' },
			alg: 'EdDSA',
		});
		const check = await verifyAgentCardForDid(created.card as unknown as AgentCard, agent.did, resolver as never);
		expect(check).toEqual({ ok: true, reasons: [] });
	});

	it('numbers versions and returns the latest, or a given version', async () => {
		const { agent } = await agentWithCard();
		await service.createCard(customerA, agent.agentId, { card: { endpoint: 'https://agent.example/v2' } });
		expect((await service.getCard(customerA, agent.agentId)).version).toBe(2);
		expect((await service.getCard(customerA, agent.agentId, 1)).version).toBe(1);
	});

	it('is published as a DID-Linked Resource of type A2AAgentCard only when asked', async () => {
		const { created: unpublished } = await agentWithCard(false);
		expect(unpublished.resourceId).toBeNull();
		expect(world.resources.size).toBe(0);

		const { agent, created } = await agentWithCard(true);
		expect(created.resourceId).toBeTruthy();
		expect(created.publishedAt).toBeInstanceOf(Date);
		const resource = world.resources.get(created.resourceId as string);
		expect(resource).toMatchObject({ did: agent.did, resourceType: 'A2AAgentCard', version: '1' });
		expect(JSON.parse(Buffer.from(resource?.data as Uint8Array).toString())).toEqual(created.card);
	});

	it('rejects a card edited after signing', async () => {
		const { agent, created } = await agentWithCard();
		const tampered = { ...(created.card as object), name: 'Evil agent' } as unknown as AgentCard;
		const check = await verifyAgentCardForDid(tampered, agent.did, resolver as never);
		expect(check.ok).toBe(false);
	});

	it('rejects a card signed by another key that claims the agent kid', async () => {
		const { agent } = await agentWithCard();
		const other = await service.register(customerA, { name: 'other', network: 'testnet' });
		const otherKeys = (await resolveDidKeys(engine, other.did)).keys;
		const forged = await signAgentCard(
			buildAgentCard(other, { endpoint: 'https://agent.example/a2a' }),
			didSigner(engine, customerA, other.did, otherKeys[0] as never),
			resolver as never
		);
		// Re-label the signature as the first agent's key: the protected header is signed, so editing it breaks it.
		const header = JSON.parse(
			Buffer.from(
				(forged.card as never as { signatures: Array<{ protected: string }> }).signatures[0]
					?.protected as string,
				'base64url'
			).toString()
		);
		header.kid = `${agent.did}#key-1`;
		const relabelled = {
			...forged.card,
			signatures: [
				{
					...(forged.card as never as { signatures: object[] }).signatures[0],
					protected: Buffer.from(JSON.stringify(header)).toString('base64url'),
				},
			],
		} as unknown as AgentCard;
		expect((await verifyAgentCardForDid(relabelled, agent.did, resolver as never)).ok).toBe(false);
	});

	it('ignores a signer-supplied jku and refuses a kid under another DID (SDK accepts any one valid signature)', async () => {
		const { agent, created } = await agentWithCard();
		const other = await service.register(customerA, { name: 'other', network: 'testnet' });
		// A card whose only signature is a valid one by ANOTHER DID, with an attacker jku: it must not verify for the agent.
		const protectedHeader = Buffer.from(
			JSON.stringify({
				alg: 'ES256',
				kid: `${other.did}#key-1`,
				typ: 'JOSE',
				jku: 'https://attacker.example/jwks.json',
			})
		).toString('base64url');
		const payload = Buffer.from(canonicalizeAgentCard(created.card as unknown as AgentCard)).toString('base64url');
		const signature = await (engine.signWithDidKey as NonNullable<IdentityEngine['signWithDidKey']>).call(
			engine,
			{
				did: other.did,
				kid: `${other.did}#key-1`,
				alg: 'ES256',
				data: Buffer.from(`${protectedHeader}.${payload}`) as never,
			},
			customerA
		);
		const card = {
			...(created.card as object),
			signatures: [{ protected: protectedHeader, signature: Buffer.from(signature).toString('base64url') }],
		} as unknown as AgentCard;
		const check = await verifyAgentCardForDid(card, agent.did, resolver as never);
		expect(check.ok).toBe(false);
		expect(check.reasons).toEqual(['kid_wrong_did']);
		// And it would have verified for the other DID, so the refusal is the pin and not a broken signature.
		expect((await verifyAgentCardForDid(card, other.did, resolver as never)).ok).toBe(true);
	});

	it('refuses did:web: that needs the shared fetch wrapper that blocks internal destinations', async () => {
		const { created } = await agentWithCard();
		const check = await verifyAgentCardForDid(
			created.card as unknown as AgentCard,
			'did:web:agent.example',
			resolver as never
		);
		expect(check).toEqual({ ok: false, reasons: ['unsupported_did_method'] });
	});
});

describe('AP2 open mandate: create (SD-JWT VC, fake signer) and verify (toolkit)', () => {
	const mandateRequest = {
		type: 'payment',
		constraints: [
			{ type: 'payment.amount_range', currency: 'USD', max: 5000 },
			{ type: 'payment.allowed_payees', allowed: [{ id: 'm1', name: 'Acme' }] },
		],
	};
	const closed = {
		vct: 'mandate.payment.1',
		transaction_id: 'tx-1',
		payee: { id: 'm1', name: 'Acme' },
		payment_amount: { amount: 1999, currency: 'USD' },
		payment_instrument: { id: 'card-1', type: 'card' },
	};

	async function issue(overrides: { mandate?: unknown } = {}) {
		const organisation = await seedOrganisationDid(world, customerA);
		const agent = await service.register(customerA, {
			name: 'buyer',
			network: 'testnet',
			actsForDid: organisation,
		});
		const { credential } = await service.grantAuthority(customerA, agent.agentId, {
			grantType: 'mandate',
			mandate: overrides.mandate ?? mandateRequest,
		});
		const issuerKey = (await resolveDidKeys(engine, organisation)).keys[0];
		const agentKeys = (await resolveDidKeys(engine, agent.did)).keys;
		return {
			organisation,
			agent,
			token: credential.value as string,
			issuerJwk: issuerKey?.jwk as Record<string, unknown>,
			agentKeys,
		};
	}

	/** The agent presents the mandate: adds a Key Binding JWT signed by its own P-256 key. */
	async function present(
		token: string,
		agentJwk: Record<string, unknown>,
		options: { aud?: string; nonce?: string; bind?: unknown } = {}
	) {
		const privateKey = world.privateKeyFor(agentJwk);
		const presenter = new SDJwtInstance<Record<string, unknown>>({
			hasher: sha256Hasher,
			saltGenerator: () => 'salt',
			kbSigner: (data: string) =>
				cryptoSign('sha256', Buffer.from(data) as never, {
					key: privateKey,
					dsaEncoding: 'ieee-p1363',
				}).toString('base64url'),
			kbSignAlg: 'ES256',
		});
		return presenter.present(token, undefined, {
			kb: {
				payload: {
					iat: Math.floor(Date.now() / 1000),
					aud: options.aud ?? 'did:web:merchant.example',
					nonce: options.nonce ?? 'n-1',
					transaction_data: [transactionDataHash(options.bind ?? closed)],
				} as never,
			},
		});
	}

	const verifyInput = (
		presentation: string,
		issuerJwk: Record<string, unknown>,
		agentKeys: Array<{ jwk: never }>
	) => ({
		presentation,
		audience: 'did:web:merchant.example',
		nonce: 'n-1',
		issuerPublicJwk: issuerJwk,
		agentKeys: agentKeys.map((key) => key.jwk),
	});

	it('creates a mandate that verifies end to end with the toolkit, bound to the agent key', async () => {
		const { token, issuerJwk, agentKeys } = await issue();
		const presentation = await present(token, agentKeys[0]?.jwk as never);
		const result = await verifyOpenMandate({
			...verifyInput(presentation, issuerJwk, agentKeys as never),
			closedMandate: closed as never,
		});
		expect(result).toMatchObject({ ok: true, reasons: [], vct: 'mandate.payment.open.1' });
		expect(result.status?.uri).toMatch(/^https:\/\/resolver\.example\//);
	});

	it('fails when the closed mandate breaks a constraint (amount over the cap)', async () => {
		const { token, issuerJwk, agentKeys } = await issue();
		const overspend = { ...closed, payment_amount: { amount: 9999, currency: 'USD' } };
		const presentation = await present(token, agentKeys[0]?.jwk as never, { bind: overspend });
		const result = await verifyOpenMandate({
			...verifyInput(presentation, issuerJwk, agentKeys as never),
			closedMandate: overspend as never,
		});
		expect(result.ok).toBe(false);
		expect(result.reasons.join(' ')).toMatch(/exceeds maximum 5000/);
	});

	it('fails when the key binding does not cover the closed mandate presented', async () => {
		const { token, issuerJwk, agentKeys } = await issue();
		const presentation = await present(token, agentKeys[0]?.jwk as never, {
			bind: { ...closed, transaction_id: 'other' },
		});
		const result = await verifyOpenMandate({
			...verifyInput(presentation, issuerJwk, agentKeys as never),
			closedMandate: closed as never,
		});
		expect(result.reasons).toContain('closed_mandate_not_bound_by_kb_jwt');
	});

	it('fails on the wrong audience, the wrong nonce, and a key that is not the issuer key', async () => {
		const { token, issuerJwk, agentKeys } = await issue();
		const presentation = await present(token, agentKeys[0]?.jwk as never);
		const base = verifyInput(presentation, issuerJwk, agentKeys as never);
		expect((await verifyOpenMandate({ ...base, audience: 'did:web:someone.else' })).ok).toBe(false);
		expect((await verifyOpenMandate({ ...base, nonce: 'replayed' })).ok).toBe(false);
		const stranger = (
			await resolveDidKeys(engine, (await service.register(customerA, { name: 's', network: 'testnet' })).did)
		).keys[0];
		expect((await verifyOpenMandate({ ...base, issuerPublicJwk: stranger?.jwk as never })).ok).toBe(false);
	});

	it('fails when the mandate is bound to a key the agent DID does not list', async () => {
		const { token, issuerJwk, agentKeys } = await issue();
		const presentation = await present(token, agentKeys[0]?.jwk as never);
		const stranger = await service.register(customerA, { name: 'stranger', network: 'testnet' });
		const strangerKeys = (await resolveDidKeys(engine, stranger.did)).keys;
		const result = await verifyOpenMandate(verifyInput(presentation, issuerJwk, strangerKeys as never));
		expect(result.reasons).toContain('cnf_not_an_agent_key');
	});

	it('fails when the issued token is altered', async () => {
		const { token, issuerJwk, agentKeys } = await issue();
		const [jwt, ...rest] = token.split('~');
		const parts = (jwt as string).split('.');
		const payload = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString());
		payload.constraints[0].max = 999999;
		const forged =
			[parts[0], Buffer.from(JSON.stringify(payload)).toString('base64url'), parts[2]].join('.') +
			'~' +
			rest.join('~');
		const presentation = await present(forged, agentKeys[0]?.jwk as never);
		const result = await verifyOpenMandate(verifyInput(presentation, issuerJwk, agentKeys as never));
		expect(result.ok).toBe(false);
	});

	it('is single hop: the request validator names re-delegation as the reason', () => {
		const verdict = validateOpenMandateRequest({ ...mandateRequest, delegateTo: 'did:cheqd:testnet:sub' });
		expect(verdict).toMatchObject({ ok: false });
		expect((verdict as { error: string }).error).toMatch(/Single hop only/);
	});

	it('signs through the fake engine only: the issuer private key is never handed to Studio code', async () => {
		const { organisation } = await issue();
		expect(world.signCalls.some((call) => call.did === organisation && call.alg === 'EdDSA')).toBe(true);
		const publicOnly = createPublicKey(
			world.privateKeyFor((await resolveDidKeys(engine, organisation)).keys[0]?.jwk as never)
		);
		expect(publicOnly.type).toBe('public');
	});

	it('can also be issued directly with any signer (the SD-JWT helper has no engine dependency)', async () => {
		const agent = await service.register(customerA, { name: 'x', network: 'testnet' });
		const key = (await resolveDidKeys(engine, agent.did)).keys[0];
		const token = await issueSdJwtVc(didSigner(engine, customerA, agent.did, key as never), {
			iss: agent.did,
			vct: 'x',
		});
		expect(token.endsWith('~')).toBe(true);
	});
});
