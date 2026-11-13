import { ECDH, createPublicKey, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { CustomerEntity } from '../../../src/database/entities/customer.entity.js';
import type { IdentityEngine } from '../../../src/services/identity/engine/identity-engine.js';
import type {
	EngineDidDocument,
	EngineSignRequest,
	EngineTokenStatusList,
	EngineTokenStatusListOptions,
	EngineTokenStatusReading,
	EngineTokenStatusUpdate,
} from '../../../src/services/identity/engine/types.js';
import type {
	AgentCardRecord,
	AgentRecord,
	AuthorityGrantRecord,
	AuthorityGrantWithStatus,
	TokenStatusListRecord,
} from '../../../src/types/agent.js';
import type {
	AgentPatch,
	AgentStore,
	NewAgent,
	NewAgentCard,
	NewGrant,
	NewStatusList,
} from '../../../src/services/agent/agent-store.js';
import { ed25519MultibaseFromPublicKeyHex } from '../../../src/services/agent/agent-keys.js';

export const customerA = { customerId: '11111111-1111-4111-8111-111111111111' } as CustomerEntity;
export const customerB = { customerId: '22222222-2222-4222-8222-222222222222' } as CustomerEntity;

interface StoredKey {
	type: string;
	publicKeyHex: string;
	privateKey: KeyObject;
	owner: string;
}

/** One shared "ledger" so a fake engine per customer sees the same DIDs, resources and status lists. */
export class World {
	keys = new Map<string, StoredKey>(); // by publicKeyHex
	dids = new Map<string, { doc: EngineDidDocument; owner: string; deactivated: boolean }>();
	resources = new Map<
		string,
		{
			did: string;
			id: string;
			name: string;
			resourceType: string;
			version: string;
			data: Uint8Array;
			created: string;
		}
	>();
	lists = new Map<string, { entries: number[]; did: string; owner: string }>();
	signCalls: EngineSignRequest[] = [];
	/** Switch a reading off to see the verifier fail closed. */
	unverifiableLists = new Set<string>();

	privateKeyFor(jwk: Record<string, unknown>): KeyObject {
		for (const key of this.keys.values()) {
			const exported = createPublicKey(key.privateKey).export({ format: 'jwk' }) as Record<string, unknown>;
			if (exported.x === jwk.x && exported.y === jwk.y) return key.privateKey;
		}
		throw new Error('unknown key');
	}
}

/** An engine that implements only what the agent endpoints use, with real crypto and no ledger. */
export class FakeEngine {
	readonly name = 'credo' as const;
	constructor(
		readonly world: World,
		private readonly customerId: string
	) {}

	async createKey(type: string, customer?: CustomerEntity) {
		const isP256 = type === 'Secp256r1';
		const pair = isP256 ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) : generateKeyPairSync('ed25519');
		let publicKeyHex: string;
		if (isP256) {
			const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
			const uncompressed = Buffer.concat([
				Buffer.from([4]),
				Buffer.from(jwk.x, 'base64url'),
				Buffer.from(jwk.y, 'base64url'),
			] as never);
			// The engine reports a compressed point, as Askar does; the service must cope.
			publicKeyHex = Buffer.from(
				ECDH.convertKey(
					uncompressed as never,
					'prime256v1',
					undefined,
					undefined,
					'compressed'
				) as unknown as Uint8Array
			).toString('hex');
		} else {
			const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string };
			publicKeyHex = Buffer.from(jwk.x, 'base64url').toString('hex');
		}
		this.world.keys.set(publicKeyHex, {
			type,
			publicKeyHex,
			privateKey: pair.privateKey,
			owner: customer?.customerId ?? this.customerId,
		});
		return { kid: publicKeyHex, type, publicKeyHex } as never;
	}

	async createDid(_network: string, doc: EngineDidDocument, customer: CustomerEntity) {
		this.world.dids.set(doc.id, { doc, owner: customer.customerId, deactivated: false });
		return { did: doc.id, provider: 'did:cheqd:testnet' };
	}

	async resolveDid(did: string, options?: { resourceMetadata?: boolean }) {
		const entry = this.world.dids.get(did);
		if (!entry) return { didDocument: null, didDocumentMetadata: {}, didResolutionMetadata: { error: 'notFound' } };
		const metadata: Record<string, unknown> = { deactivated: entry.deactivated };
		if (options?.resourceMetadata) {
			metadata.linkedResourceMetadata = [...this.world.resources.values()]
				.filter((resource) => resource.did === did)
				.map((resource) => ({
					resourceId: resource.id,
					resourceName: resource.name,
					resourceType: resource.resourceType,
					version: resource.version,
					created: resource.created,
				}));
		}
		return { didDocument: entry.doc, didDocumentMetadata: metadata, didResolutionMetadata: {} };
	}

	async createResource(
		network: string,
		payload: {
			id?: string;
			collectionId?: string;
			name: string;
			resourceType: string;
			version?: string;
			data?: Uint8Array | string;
		}
	) {
		const did = `did:cheqd:${network}:${payload.collectionId}`;
		const id = payload.id ?? uuidv4();
		this.world.resources.set(id, {
			did,
			id,
			name: payload.name,
			resourceType: payload.resourceType,
			version: payload.version ?? '1',
			data: (typeof payload.data === 'string' ? Buffer.from(payload.data) : payload.data) as never,
			created: new Date(Date.now() + this.world.resources.size).toISOString(),
		});
		return true;
	}

	async resolve(didUrl: string) {
		const id = didUrl.split('/resources/')[1];
		const resource = id ? this.world.resources.get(id) : undefined;
		if (!resource) return new Response('not found', { status: 404 });
		return new Response(Buffer.from(resource.data) as never, {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	}

	async createCredential(credential: Record<string, unknown>) {
		return { ...credential, proof: { type: 'JwtProof2020', jwt: 'fake.jwt.value' } };
	}

	async signWithDidKey(request: EngineSignRequest, customer: CustomerEntity): Promise<Uint8Array> {
		this.world.signCalls.push(request);
		const entry = this.world.dids.get(request.did);
		if (!entry || entry.owner !== customer.customerId) throw new Error(`${request.did} not found in wallet`);
		const method = (
			entry.doc.verificationMethod as Array<{
				id: string;
				publicKeyJwk?: Record<string, unknown>;
				publicKeyMultibase?: string;
			}>
		).find((candidate) => candidate.id === request.kid);
		if (!method) throw new Error('unknown kid');
		let key: KeyObject | undefined;
		if (method.publicKeyJwk) key = this.world.privateKeyFor(method.publicKeyJwk);
		else
			key = [...this.world.keys.values()].find(
				(candidate) =>
					candidate.type === 'Ed25519' &&
					ed25519MultibaseFromPublicKeyHex(candidate.publicKeyHex) === method.publicKeyMultibase
			)?.privateKey;
		if (!key) throw new Error('key not in custody');
		const data = Buffer.from(request.data) as never;
		const signature =
			request.alg === 'ES256'
				? cryptoSign('sha256', data, { key, dsaEncoding: 'ieee-p1363' })
				: cryptoSign(null, data, key);
		return new Uint8Array(signature);
	}

	async createTokenStatusList(
		did: string,
		options: EngineTokenStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineTokenStatusList> {
		const entry = this.world.dids.get(did);
		if (!entry || entry.owner !== customer.customerId) throw new Error(`${did} not found in wallet`);
		const size = options.size ?? 128;
		const uri = `https://resolver.example/${did}/resources/${uuidv4()}`;
		this.world.lists.set(uri, { entries: new Array(size).fill(0), did, owner: customer.customerId });
		return { uri, name: options.name, bits: options.bits ?? 2, size };
	}

	async setTokenStatus(
		did: string,
		listUri: string,
		updates: EngineTokenStatusUpdate[],
		customer: CustomerEntity
	): Promise<void> {
		const list = this.world.lists.get(listUri);
		if (!list || list.owner !== customer.customerId || list.did !== did)
			throw new Error('status list not found in wallet');
		for (const update of updates) list.entries[update.index] = update.status;
	}

	async getTokenStatus(listUri: string, index: number): Promise<EngineTokenStatusReading> {
		const list = this.world.lists.get(listUri);
		if (!list || this.world.unverifiableLists.has(listUri))
			return { status: 0, verified: false, error: 'unreachable' };
		return { status: list.entries[index] ?? 0, verified: true };
	}
}

export function engineFor(world: World) {
	return async (customer: CustomerEntity) => new FakeEngine(world, customer.customerId) as unknown as IdentityEngine;
}

/** An organisation DID in a customer's account with one Ed25519 key, as Studio customers have today. */
export async function seedOrganisationDid(world: World, customer: CustomerEntity, suffix = uuidv4()) {
	const engine = new FakeEngine(world, customer.customerId);
	const key = (await engine.createKey('Ed25519', customer)) as unknown as { publicKeyHex: string };
	const did = `did:cheqd:testnet:${suffix}`;
	const kid = `${did}#key-1`;
	const jwk = createPublicKey(world.keys.get(key.publicKeyHex)?.privateKey as KeyObject).export({ format: 'jwk' });
	await engine.createDid(
		'testnet',
		{
			id: did,
			verificationMethod: [{ id: kid, type: 'JsonWebKey2020', controller: did, publicKeyJwk: jwk }],
			authentication: [kid],
			assertionMethod: [kid],
		},
		customer
	);
	return did;
}

export class FakeStore implements AgentStore {
	agents = new Map<string, AgentRecord>();
	cards: AgentCardRecord[] = [];
	grants = new Map<string, AuthorityGrantWithStatus>();
	lists = new Map<string, TokenStatusListRecord & { customerId: string }>();
	/** Every customerId a tenant-scoped method was called with, to prove nothing runs unscoped. */
	calls: Array<{ method: string; customerId: string | undefined }> = [];

	constructor(private readonly world: World) {}

	private note(method: string, customerId: string | undefined) {
		this.calls.push({ method, customerId });
		if (!customerId) throw new Error('unscoped call');
	}

	async countOwnedDids(customerId: string, did: string) {
		this.note('countOwnedDids', customerId);
		return this.world.dids.get(did)?.owner === customerId ? 1 : 0;
	}
	async countAgents(customerId: string, agentId: string) {
		this.note('countAgents', customerId);
		const agent = this.agents.get(agentId);
		return agent && agent.customerId === customerId && !agent.deletedAt ? 1 : 0;
	}
	async createAgent(input: NewAgent) {
		this.note('createAgent', input.customerId);
		const now = new Date();
		const agent: AgentRecord = {
			agentId: uuidv4(),
			customerId: input.customerId,
			did: input.did,
			name: input.name,
			description: input.description ?? null,
			actsForDid: input.actsForDid ?? null,
			status: 'active',
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
		};
		this.agents.set(agent.agentId, agent);
		return agent;
	}
	async getAgent(customerId: string, agentId: string) {
		this.note('getAgent', customerId);
		const agent = this.agents.get(agentId);
		return agent && agent.customerId === customerId && !agent.deletedAt ? agent : null;
	}
	async listAgents(customerId: string, page: { limit: number; offset: number }) {
		this.note('listAgents', customerId);
		const all = [...this.agents.values()].filter((agent) => agent.customerId === customerId && !agent.deletedAt);
		return { items: all.slice(page.offset, page.offset + page.limit), total: all.length };
	}
	async updateAgent(customerId: string, agentId: string, patch: AgentPatch) {
		this.note('updateAgent', customerId);
		const agent = await this.getAgent(customerId, agentId);
		if (!agent) return null;
		Object.assign(agent, patch, { updatedAt: new Date() });
		return agent;
	}
	async softDeleteAgent(customerId: string, agentId: string) {
		this.note('softDeleteAgent', customerId);
		const agent = await this.getAgent(customerId, agentId);
		if (!agent) return false;
		agent.status = 'deleted';
		agent.deletedAt = new Date();
		return true;
	}
	async latestCardVersion(customerId: string, agentId: string) {
		this.note('latestCardVersion', customerId);
		return Math.max(
			0,
			...this.cards.filter((c) => c.customerId === customerId && c.agentId === agentId).map((c) => c.version)
		);
	}
	async createCard(card: NewAgentCard) {
		this.note('createCard', card.customerId);
		const record: AgentCardRecord = {
			id: uuidv4(),
			agentId: card.agentId,
			customerId: card.customerId,
			version: card.version,
			card: card.card,
			jws: card.jws ?? null,
			resourceId: card.resourceId ?? null,
			publishedAt: card.publishedAt ?? null,
			createdAt: new Date(),
		};
		this.cards.push(record);
		return record;
	}
	async getCard(customerId: string, agentId: string, version?: number) {
		this.note('getCard', customerId);
		const matching = this.cards
			.filter(
				(c) =>
					c.customerId === customerId &&
					c.agentId === agentId &&
					(version === undefined || c.version === version)
			)
			.sort((a, b) => b.version - a.version);
		return matching[0] ?? null;
	}
	async countGrants(customerId: string, agentId: string, grantId: string) {
		this.note('countGrants', customerId);
		const grant = this.grants.get(grantId);
		return grant && grant.customerId === customerId && grant.agentId === agentId ? 1 : 0;
	}
	async getGrant(customerId: string, agentId: string, grantId: string) {
		this.note('getGrant', customerId);
		const grant = this.grants.get(grantId);
		return grant && grant.customerId === customerId && grant.agentId === agentId ? grant : null;
	}
	async listLiveGrants(customerId: string, agentId: string) {
		this.note('listLiveGrants', customerId);
		return [...this.grants.values()].filter(
			(g) => g.customerId === customerId && g.agentId === agentId && !g.revokedAt
		);
	}
	async createGrant(input: NewGrant): Promise<AuthorityGrantRecord> {
		this.note('createGrant', input.customerId);
		const list = input.statusListId ? this.lists.get(input.statusListId) : undefined;
		const grant: AuthorityGrantWithStatus = {
			id: uuidv4(),
			agentId: input.agentId,
			customerId: input.customerId,
			grantType: input.grantType,
			issuedCredentialId: uuidv4(),
			statusListId: input.statusListId ?? null,
			statusIndex: input.statusIndex ?? null,
			expiresAt: input.expiresAt ?? null,
			revokedAt: null,
			createdAt: new Date(),
			issuerDid: input.issuerDid,
			statusListUri: list?.uri ?? null,
		};
		this.grants.set(grant.id, grant);
		return grant;
	}
	async markGrantRevoked(customerId: string, agentId: string, grantId: string) {
		this.note('markGrantRevoked', customerId);
		const grant = await this.getGrant(customerId, agentId, grantId);
		if (!grant) return null;
		grant.revokedAt ??= new Date();
		return grant;
	}
	async findOpenStatusList(customerId: string, issuerDid: string) {
		this.note('findOpenStatusList', customerId);
		return (
			[...this.lists.values()].find(
				(l) => l.customerId === customerId && l.issuerDid === issuerDid && l.writeCursor < l.size
			) ?? null
		);
	}
	async createStatusList(list: NewStatusList) {
		this.note('createStatusList', list.customerId);
		const record = {
			registryId: uuidv4(),
			uri: list.uri,
			issuerDid: list.issuerDid,
			name: list.name,
			size: list.size,
			writeCursor: 0,
			customerId: list.customerId,
		};
		this.lists.set(record.registryId, record);
		return record;
	}
	async reserveStatusIndex(customerId: string, registryId: string) {
		this.note('reserveStatusIndex', customerId);
		const list = this.lists.get(registryId);
		if (!list || list.customerId !== customerId || list.writeCursor >= list.size) return null;
		return list.writeCursor++;
	}
}

export function newWorld() {
	const world = new World();
	return { world, store: new FakeStore(world), engineFor: engineFor(world) };
}
