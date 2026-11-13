import { v4 as uuidv4 } from 'uuid';
import { fromString } from 'uint8arrays';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type {
	AgentCardRecord,
	AgentNetwork,
	AgentRecord,
	AuthorityGrantRecord,
	AuthorityGrantWithStatus,
	GrantType,
	TokenStatusListRecord,
} from '../../types/agent.js';
import { AGENT_SETTABLE_STATUSES, VCT } from '../../types/agent.js';
import type { IdentityEngine } from '../identity/engine/identity-engine.js';
import { buildAgentDidDocument } from './agent-keys.js';
import { AGENT_CARD_RESOURCE_TYPE, buildAgentCard, signAgentCard } from './agent-card.js';
import type { AgentCardInput } from './agent-card.js';
import { assertionKeys, didSigner, engineMethod, requireCapabilities, resolveDidKeys } from './agent-engine.js';
import type { AgentEngineProvider } from './agent-engine.js';
import { badRequest, conflict, featureDisabled, notFound, unauthorised, upstreamFailure } from './agent-errors.js';
import type { AgentPatch, AgentStore } from './agent-store.js';
import { validateOpenMandateRequest } from './ap2-mandate.js';
import { issueSdJwtVc } from './sd-jwt.js';

export interface RegisterAgentInput {
	name: string;
	description?: string;
	network: AgentNetwork;
	/** The organisation DID the agent acts for. Must be one of the customer's DIDs. */
	actsForDid?: string;
}

export interface GrantInput {
	grantType: GrantType;
	/** The DID that issues the grant. Defaults to the agent's `actsForDid`. Must be one of the customer's DIDs. */
	issuerDid?: string;
	/** ISO 8601. Becomes `exp` and `expiresAt`. */
	expiresAt?: string;
	/** `tool-scope`: the tools the agent may call. */
	tools?: string[];
	/** `mandate`: an AP2 open mandate request (single hop). */
	mandate?: unknown;
	/** `delegation`: scopes of a KYA-OS delegation. */
	scopes?: string[];
}

export interface IssuedAuthority {
	grant: AuthorityGrantRecord;
	credential: { format: 'sd-jwt-vc' | 'jwt'; value: unknown };
	/** `untested` for KYA-OS delegations (gate T9), absent otherwise. */
	label?: 'untested';
}

export interface AgentServiceOptions {
	store: AgentStore;
	engineFor: AgentEngineProvider;
	/** KYA-OS delegations are off unless this is true (env `ENABLE_KYA_OS_DELEGATIONS`). */
	kyaOsDelegationsEnabled?: () => boolean;
	now?: () => Date;
	newId?: () => string;
	/** Number of entries in a status list this service creates. */
	statusListSize?: number;
}

const DEFAULT_STATUS_LIST_SIZE = 131072;
const MAX_NAME = 200;
const MAX_DESCRIPTION = 2000;

const requireCustomer = (customer: CustomerEntity | undefined): CustomerEntity => {
	if (!customer?.customerId) throw unauthorised();
	return customer;
};

/**
 * Agent registration, cards and authority grants.
 *
 * Tenancy: every public method starts with `owned()`, which counts the customer's rows for the agent and answers
 * 404 for anything else, including another customer's agent; every store call after that filters by the
 * customer again. Nothing here trusts a caller-supplied customer id.
 *
 * Engine: everything that signs or touches the ledger goes through the `IdentityEngine` interface, and uses only
 * the optional agent methods documented there (`signWithDidKey`, `createTokenStatusList`, `setTokenStatus`).
 */
export class AgentService {
	private readonly store: AgentStore;
	private readonly engineFor: AgentEngineProvider;
	private readonly kyaOsEnabled: () => boolean;
	private readonly now: () => Date;
	private readonly newId: () => string;
	private readonly statusListSize: number;

	constructor(options: AgentServiceOptions) {
		this.store = options.store;
		this.engineFor = options.engineFor;
		this.kyaOsEnabled = options.kyaOsDelegationsEnabled ?? (() => process.env.ENABLE_KYA_OS_DELEGATIONS === 'true');
		this.now = options.now ?? (() => new Date());
		this.newId = options.newId ?? uuidv4;
		this.statusListSize = options.statusListSize ?? DEFAULT_STATUS_LIST_SIZE;
	}

	// --- Agents -------------------------------------------------------------------------------------------

	async register(customerIn: CustomerEntity | undefined, input: RegisterAgentInput): Promise<AgentRecord> {
		const customer = requireCustomer(customerIn);
		const name = input.name?.trim();
		if (!name || name.length > MAX_NAME) throw badRequest(`name is required (1 to ${MAX_NAME} characters)`);
		if (input.description !== undefined && input.description.length > MAX_DESCRIPTION) {
			throw badRequest(`description is at most ${MAX_DESCRIPTION} characters`);
		}
		if (input.actsForDid) await this.requireOwnedDid(customer, input.actsForDid);

		const engine = await this.engineFor(customer);
		// Both keys are created by the engine; the private halves never come back.
		const p256 = await engine.createKey('Secp256r1', customer, `agent-${name}-p256`);
		const ed25519 = await engine.createKey('Ed25519', customer, `agent-${name}-ed25519`);
		const document = buildAgentDidDocument({
			network: input.network,
			id: this.newId(),
			p256PublicKeyHex: p256.publicKeyHex,
			ed25519PublicKeyHex: ed25519.publicKeyHex,
		});
		const identifier = await engine.createDid(input.network, document, customer);

		try {
			return await this.store.createAgent({
				customerId: customer.customerId,
				did: identifier.did,
				name,
				description: input.description,
				actsForDid: input.actsForDid,
			});
		} catch (error) {
			throw upstreamFailure(
				`The DID ${identifier.did} was created but the agent could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`
			);
		}
	}

	async list(customerIn: CustomerEntity | undefined, page: { limit: number; offset: number }) {
		const customer = requireCustomer(customerIn);
		return this.store.listAgents(customer.customerId, page);
	}

	async get(customerIn: CustomerEntity | undefined, agentId: string): Promise<AgentRecord> {
		const customer = requireCustomer(customerIn);
		return this.owned(customer, agentId);
	}

	async update(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		patch: { name?: string; description?: string | null; actsForDid?: string | null; status?: string }
	): Promise<AgentRecord> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const change: AgentPatch = {};
		if (patch.name !== undefined) {
			const name = patch.name.trim();
			if (!name || name.length > MAX_NAME) throw badRequest(`name must be 1 to ${MAX_NAME} characters`);
			change.name = name;
		}
		if (patch.description !== undefined) {
			if (patch.description !== null && patch.description.length > MAX_DESCRIPTION) {
				throw badRequest(`description is at most ${MAX_DESCRIPTION} characters`);
			}
			change.description = patch.description;
		}
		if (patch.actsForDid !== undefined) {
			if (patch.actsForDid !== null) await this.requireOwnedDid(customer, patch.actsForDid);
			change.actsForDid = patch.actsForDid;
		}
		if (patch.status !== undefined) {
			if (!(AGENT_SETTABLE_STATUSES as readonly string[]).includes(patch.status)) {
				throw badRequest(`status must be one of: ${AGENT_SETTABLE_STATUSES.join(', ')}`);
			}
			change.status = patch.status;
		}
		if (Object.keys(change).length === 0) throw badRequest('Nothing to update');
		const updated = await this.store.updateAgent(customer.customerId, agentId, change);
		if (!updated) throw notFound();
		return updated;
	}

	/**
	 * Soft-deletes the agent. Live authority grants are revoked first, so a deleted agent cannot keep using a
	 * credential: if that cannot be done (no engine capability, ledger failure) the agent is NOT deleted.
	 */
	async remove(customerIn: CustomerEntity | undefined, agentId: string): Promise<{ revokedGrants: number }> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const live = await this.store.listLiveGrants(customer.customerId, agentId);
		for (const grant of live) await this.revokeLoaded(customer, grant);
		if (!(await this.store.softDeleteAgent(customer.customerId, agentId))) throw notFound();
		return { revokedGrants: live.length };
	}

	// --- Cards --------------------------------------------------------------------------------------------

	async createCard(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: { card: AgentCardInput; publish?: boolean; alg?: 'ES256' | 'EdDSA' }
	): Promise<AgentCardRecord> {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		if (agent.status !== 'active') throw conflict(`The agent is ${agent.status}`);
		const engine = await this.engineFor(customer);
		requireCapabilities(engine, 'signWithDidKey');

		const resolved = await resolveDidKeys(engine, agent.did);
		if (resolved.deactivated) throw conflict('The agent DID is deactivated');
		const alg = input.alg ?? 'ES256';
		const key = resolved.keys.find((candidate) => candidate.alg === alg);
		if (!key) throw upstreamFailure(`The agent DID has no ${alg} key`);

		const card = buildAgentCard(agent, input.card);
		const signed = await signAgentCard(card, didSigner(engine, customer, agent.did, key), async (did) =>
			did === agent.did ? resolved.document : (await engine.resolveDid(did)).didDocument
		);

		const version = (await this.store.latestCardVersion(customer.customerId, agentId)) + 1;
		let resourceId: string | undefined;
		let publishedAt: Date | undefined;
		if (input.publish) {
			resourceId = this.newId();
			const network = agent.did.split(':')[2] as string;
			await engine.createResource(
				network,
				{
					id: resourceId,
					collectionId: agent.did.split(':').pop() as string,
					name: `agent-card-${agent.agentId}`,
					resourceType: AGENT_CARD_RESOURCE_TYPE,
					version: String(version),
					data: fromString(JSON.stringify(signed.card)),
				},
				customer
			);
			publishedAt = this.now();
		}
		return this.store.createCard({
			agentId,
			customerId: customer.customerId,
			version,
			card: signed.card as unknown as Record<string, unknown>,
			jws: signed.jws,
			resourceId,
			publishedAt,
		});
	}

	async getCard(customerIn: CustomerEntity | undefined, agentId: string, version?: number): Promise<AgentCardRecord> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const card = await this.store.getCard(customer.customerId, agentId, version);
		if (!card) throw notFound('Agent card');
		return card;
	}

	// --- Authority ----------------------------------------------------------------------------------------

	/** The agent's grants, newest first, with a status worked out from `revokedAt` and `expiresAt`. */
	async listAuthority(customerIn: CustomerEntity | undefined, agentId: string) {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const now = this.now();
		const grants = await this.store.listGrants(customer.customerId, agentId);
		return grants.map((grant) => ({
			id: grant.id,
			grantType: grant.grantType,
			status: grant.revokedAt ? 'revoked' : grant.expiresAt && grant.expiresAt <= now ? 'expired' : 'active',
			createdAt: grant.createdAt,
			expiresAt: grant.expiresAt ?? null,
			revokedAt: grant.revokedAt ?? null,
		}));
	}

	async grantAuthority(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: GrantInput
	): Promise<IssuedAuthority> {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		if (agent.status !== 'active') throw conflict(`The agent is ${agent.status}`);

		if (input.grantType === 'delegation' && !this.kyaOsEnabled()) {
			throw featureDisabled(
				'KYA-OS delegations are switched off (ENABLE_KYA_OS_DELEGATIONS). They are untested until gate T9 passes.'
			);
		}
		const issuerDid = input.issuerDid ?? agent.actsForDid ?? undefined;
		if (!issuerDid) throw badRequest('issuerDid is required when the agent has no actsForDid');
		await this.requireOwnedDid(customer, issuerDid);

		const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
		if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= this.now())) {
			throw badRequest('expiresAt must be a future ISO 8601 date');
		}
		const engine = await this.engineFor(customer);
		if (input.grantType === 'delegation')
			return this.issueDelegation(customer, engine, agent, issuerDid, input, expiresAt);

		requireCapabilities(engine, 'signWithDidKey', 'createTokenStatusList', 'setTokenStatus');

		// The claims first, so a bad request costs nothing: no key is used and no list index is taken.
		const agentDid = await resolveDidKeys(engine, agent.did);
		const agentKey = agentDid.keys.find((key) => key.alg === 'ES256');
		const { vct, specific } = this.claimsFor(input, agentKey?.jwk);
		const issuer = await resolveDidKeys(engine, issuerDid);
		if (issuer.deactivated) throw conflict('The issuer DID is deactivated');
		const issuerKey = assertionKeys(issuer)[0];
		if (!issuerKey) throw upstreamFailure(`The issuer DID ${issuerDid} has no usable key`);

		const { list, index } = await this.takeStatusIndex(customer, engine, issuerDid);
		const issuedAt = Math.floor(this.now().getTime() / 1000);
		const claims: Record<string, unknown> = {
			iss: issuerDid,
			sub: agent.did,
			vct,
			...specific,
			iat: issuedAt,
			...(expiresAt ? { exp: Math.floor(expiresAt.getTime() / 1000) } : {}),
			status: { status_list: { idx: index, uri: list.uri } },
		};
		const compact = await issueSdJwtVc(didSigner(engine, customer, issuerDid, issuerKey), claims);
		const grant = await this.store.createGrant({
			agentId,
			customerId: customer.customerId,
			grantType: input.grantType,
			issuerDid,
			subjectDid: agent.did,
			format: 'sd-jwt-vc',
			vct,
			statusListId: list.registryId,
			statusIndex: index,
			statusUri: list.uri,
			expiresAt,
		});
		return { grant, credential: { format: 'sd-jwt-vc', value: compact } };
	}

	async revokeAuthority(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		grantId: string
	): Promise<AuthorityGrantWithStatus> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		if ((await this.store.countGrants(customer.customerId, agentId, grantId)) === 0)
			throw notFound('Authority grant');
		const grant = await this.store.getGrant(customer.customerId, agentId, grantId);
		if (!grant) throw notFound('Authority grant');
		return this.revokeLoaded(customer, grant);
	}

	// --- Internals ----------------------------------------------------------------------------------------

	/** Ownership by count, then a customer-scoped read. 404 for anything that is not this customer's agent. */
	private async owned(customer: CustomerEntity, agentId: string): Promise<AgentRecord> {
		if ((await this.store.countAgents(customer.customerId, agentId)) === 0) throw notFound();
		const agent = await this.store.getAgent(customer.customerId, agentId);
		if (!agent) throw notFound();
		return agent;
	}

	private async requireOwnedDid(customer: CustomerEntity, did: string): Promise<void> {
		if ((await this.store.countOwnedDids(customer.customerId, did)) === 0) {
			throw notFound(`DID ${did} in your account`);
		}
	}

	/** The claims that depend on the grant type. `iss`, `sub`, `iat`, `exp` and `status` are added by the caller. */
	private claimsFor(
		input: GrantInput,
		agentKeyJwk: Record<string, unknown> | undefined
	): { vct: string; specific: Record<string, unknown> } {
		switch (input.grantType) {
			case 'acts-for':
				return { vct: VCT.actsFor, specific: {} };
			case 'tool-scope': {
				const tools = input.tools;
				if (
					!Array.isArray(tools) ||
					tools.length === 0 ||
					tools.length > 50 ||
					tools.some((t) => typeof t !== 'string' || t.length === 0 || t.length > 128)
				) {
					throw badRequest('tools must be a list of 1 to 50 tool names (1 to 128 characters each)');
				}
				return { vct: VCT.toolScope, specific: { tools } };
			}
			case 'mandate': {
				const validation = validateOpenMandateRequest(input.mandate);
				if (!validation.ok) throw badRequest(validation.error);
				// Single hop: the key binding is always the agent's own signing key, never a caller-supplied one.
				if (!agentKeyJwk) throw upstreamFailure('The agent DID has no P-256 key to bind the mandate to');
				return {
					vct: validation.mandate.type === 'payment' ? VCT.paymentOpenMandate : VCT.checkoutOpenMandate,
					specific: { constraints: validation.mandate.constraints, cnf: { jwk: agentKeyJwk } },
				};
			}
			default:
				throw badRequest(`Unsupported grantType ${String(input.grantType)}`);
		}
	}

	/** Next free index of an open Token Status List of the issuer; opens a new list when there is none or it is full. */
	private async takeStatusIndex(
		customer: CustomerEntity,
		engine: IdentityEngine,
		issuerDid: string
	): Promise<{ list: TokenStatusListRecord; index: number }> {
		for (let attempt = 0; attempt < 2; attempt++) {
			let list = await this.store.findOpenStatusList(customer.customerId, issuerDid);
			if (!list) {
				const name = `agent-authority-${this.newId().slice(0, 8)}`;
				const created = await engineMethod(engine, 'createTokenStatusList')(
					issuerDid,
					{ name, bits: 2, size: this.statusListSize },
					customer
				);
				list = await this.store.createStatusList({
					customerId: customer.customerId,
					issuerDid,
					uri: created.uri,
					name: created.name,
					size: created.size,
				});
			}
			const index = await this.store.reserveStatusIndex(customer.customerId, list.registryId);
			if (index !== null) return { list, index };
		}
		throw conflict('No status list index is available; try again');
	}

	private async revokeLoaded(
		customer: CustomerEntity,
		grant: AuthorityGrantWithStatus
	): Promise<AuthorityGrantWithStatus> {
		if (grant.revokedAt) return grant;
		if (grant.statusListUri && grant.issuerDid && grant.statusIndex !== null && grant.statusIndex !== undefined) {
			const engine = await this.engineFor(customer);
			requireCapabilities(engine, 'setTokenStatus');
			await engineMethod(engine, 'setTokenStatus')(
				grant.issuerDid,
				grant.statusListUri,
				[{ index: grant.statusIndex, status: 1 }],
				customer
			);
		}
		const revoked = await this.store.markGrantRevoked(customer.customerId, grant.agentId, grant.id);
		if (!revoked) throw notFound('Authority grant');
		return revoked;
	}

	/**
	 * KYA-OS delegation. GATED and UNTESTED: it is only reachable with `ENABLE_KYA_OS_DELEGATIONS=true`, it has
	 * not been exercised against @kya-os/mcp's verifier (gate T9), and it carries no status list entry, so
	 * revocation is recorded in Studio only and does not reach a verifier. The UI must show it as untested.
	 */
	private async issueDelegation(
		customer: CustomerEntity,
		engine: IdentityEngine,
		agent: AgentRecord,
		issuerDid: string,
		input: GrantInput,
		expiresAt: Date | undefined
	): Promise<IssuedAuthority> {
		const scopes = input.scopes;
		if (
			!Array.isArray(scopes) ||
			scopes.length === 0 ||
			scopes.length > 50 ||
			scopes.some((s) => typeof s !== 'string' || s.length === 0 || s.length > 128)
		) {
			throw badRequest('scopes must be a list of 1 to 50 scope names (1 to 128 characters each)');
		}
		const credential = await engine.createCredential(
			{
				'@context': ['https://www.w3.org/ns/credentials/v2'],
				type: ['VerifiableCredential', 'DelegationCredential'],
				issuer: { id: issuerDid },
				issuanceDate: this.now().toISOString(),
				...(expiresAt ? { expirationDate: expiresAt.toISOString() } : {}),
				credentialSubject: { id: agent.did, delegation: { scopes, issuerDid, subjectDid: agent.did } },
			},
			'jwt',
			null,
			customer
		);
		const grant = await this.store.createGrant({
			agentId: agent.agentId,
			customerId: customer.customerId,
			grantType: 'delegation',
			issuerDid,
			subjectDid: agent.did,
			format: 'jwt',
			vct: 'DelegationCredential',
			expiresAt,
		});
		return { grant, credential: { format: 'jwt', value: credential }, label: 'untested' };
	}
}
