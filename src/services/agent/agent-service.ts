import { unfundedPayerFailure } from '../../helpers/ledger-errors.js';
import { LedgerUnavailableError } from '../identity/ledger-lock.js';
import { isTimeoutError } from '../idempotency/idempotency.js';
import { sanitiseEventDetail } from './agent-event-detail.js';
import { v4 as uuidv4 } from 'uuid';
import { fromString } from 'uint8arrays';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type {
	AgentActor,
	AgentCapabilities,
	AgentCardRecord,
	AgentEventRecord,
	AgentEventType,
	AgentNetwork,
	AgentRecord,
	AuthoritySummary,
	AuthorityGrantWithStatus,
	GrantType,
	PaymentAddressBindingRecord,
	PaymentAddressBindingWithStatus,
	TokenStatusListRecord,
} from '../../types/agent.js';
import { AGENT_SETTABLE_STATUSES, CAPABILITY_NAMES, VCT, defaultCapabilities } from '../../types/agent.js';
import type { IdentityEngine } from '../identity/engine/identity-engine.js';
import { buildAgentDidDocument, documentWithNewKey, nextKeyFragment } from './agent-keys.js';
import { viewKeys } from './agent-key-view.js';
import type { AgentKeyView, KeyHistory } from './agent-key-view.js';
import { summariseGrant } from './grant-summary.js';
import { AGENT_CARD_RESOURCE_TYPE, buildAgentCard, signAgentCard } from './agent-card.js';
import type { AgentCardInput } from './agent-card.js';
import { assertionKeys, didSigner, engineMethod, requireCapabilities, resolveDidKeys } from './agent-engine.js';
import type { AgentEngineProvider } from './agent-engine.js';
import {
	actsForExists,
	badRequest,
	conflict,
	featureDisabled,
	notFound,
	unauthorised,
	upstreamFailure,
} from './agent-errors.js';
import type { AgentPatch, AgentStore } from './agent-store.js';
import { validateOpenMandateRequest } from './ap2-mandate.js';
import { parseCaip10 } from './caip10.js';
import { buildSettlementView, summariseMandate } from './settlement.js';
import type { SettlementView } from './settlement.js';
import { issueSdJwtVc } from './sd-jwt.js';

/** Who is calling, for the activity feed and the audit log. */
export interface CallContext {
	actor?: AgentActor;
	/** The internal user id, for the audit log only. Never returned. */
	userId?: string;
}

/** The label set an owner may send: any of the four flags, nothing else. */
export type CapabilitiesInput = Partial<AgentCapabilities>;

export interface RegisterAgentInput {
	name: string;
	description?: string;
	capabilities?: CapabilitiesInput;
	/** Free text for analytics. Stored, never trusted. */
	useCase?: string;
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
	grant: AuthorityGrantWithStatus;
	credential: { format: 'sd-jwt-vc' | 'jwt'; value: unknown };
	/** `untested` for KYA-OS delegations (gate T9), absent otherwise. */
	label?: 'untested';
}

export interface IssuedPaymentAddressBinding {
	binding: PaymentAddressBindingRecord;
	/** Returned once and never stored. */
	credential: { format: 'sd-jwt-vc'; value: string };
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
	/** The resolver base URL (ends with `/`), for the card URL. Defaults to `RESOLVER_URL`. */
	resolverUrl?: () => string;
	/** Longest a grant's expiry may be set to, from now. Defaults to `AGENT_GRANT_MAX_LIFETIME_DAYS` or 365 days. */
	maxGrantLifetimeDays?: () => number;
}

const DEFAULT_STATUS_LIST_SIZE = 131072;
const MAX_NAME = 200;
const MAX_DESCRIPTION = 2000;
const MAX_USE_CASE = 64;
const DEFAULT_MAX_GRANT_LIFETIME_DAYS = 365;
const DEFAULT_RESOLVER_URL = 'https://resolver.cheqd.net/1.0/identifiers/';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Live payment address bindings per agent. */
export const MAX_PAYMENT_ADDRESSES = 10;
/** Token Status List values (draft-ietf-oauth-status-list): 0 valid, 1 invalid (revoked), 2 suspended. */
const STATUS_VALID = 0;
const STATUS_REVOKED = 1;
const STATUS_SUSPENDED = 2;

/** Merges the labels an owner sent over a base. Unknown names and non-booleans are a 400, never ignored. */
function mergeCapabilities(base: AgentCapabilities, input: unknown): AgentCapabilities {
	if (input === undefined) return base;
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		throw badRequest('capabilities must be an object');
	}
	const merged = { ...base };
	for (const [name, value] of Object.entries(input)) {
		if (!(CAPABILITY_NAMES as readonly string[]).includes(name)) {
			throw badRequest(`capabilities has no "${name}" (use ${CAPABILITY_NAMES.join(', ')})`);
		}
		if (typeof value !== 'boolean') throw badRequest(`capabilities.${name} must be true or false`);
		merged[name as keyof AgentCapabilities] = value;
	}
	return merged;
}

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
	private readonly resolverUrl: () => string;
	private readonly maxGrantLifetimeDays: () => number;
	/** Key changes and expiry changes in progress in this process (`agent:<id>` or `grant:<id>`). */
	private readonly inFlight = new Set<string>();

	constructor(options: AgentServiceOptions) {
		this.store = options.store;
		this.engineFor = options.engineFor;
		this.kyaOsEnabled = options.kyaOsDelegationsEnabled ?? (() => process.env.ENABLE_KYA_OS_DELEGATIONS === 'true');
		this.now = options.now ?? (() => new Date());
		this.newId = options.newId ?? uuidv4;
		this.statusListSize = options.statusListSize ?? DEFAULT_STATUS_LIST_SIZE;
		this.resolverUrl =
			options.resolverUrl ?? (() => (process.env.RESOLVER_URL || DEFAULT_RESOLVER_URL).replace(/\/?$/, '/'));
		this.maxGrantLifetimeDays =
			options.maxGrantLifetimeDays ??
			(() => {
				const configured = Number(process.env.AGENT_GRANT_MAX_LIFETIME_DAYS);
				return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_GRANT_LIFETIME_DAYS;
			});
	}

	// --- Agents -------------------------------------------------------------------------------------------

	async register(
		customerIn: CustomerEntity | undefined,
		input: RegisterAgentInput,
		ctx: CallContext = {}
	): Promise<AgentRecord> {
		const customer = requireCustomer(customerIn);
		const name = input.name?.trim();
		if (!name || name.length > MAX_NAME) throw badRequest(`name is required (1 to ${MAX_NAME} characters)`);
		if (input.description !== undefined && input.description.length > MAX_DESCRIPTION) {
			throw badRequest(`description is at most ${MAX_DESCRIPTION} characters`);
		}
		if (input.useCase !== undefined && (typeof input.useCase !== 'string' || input.useCase.length > MAX_USE_CASE)) {
			throw badRequest(`useCase is at most ${MAX_USE_CASE} characters`);
		}
		const capabilities = mergeCapabilities(defaultCapabilities(), input.capabilities);
		if (input.actsForDid) await this.requireOwnedDid(customer, input.actsForDid);

		const engine = await this.engineFor(customer);
		// Both keys are created by the engine; the private halves never come back.
		const p256 = await engine.createKey('Secp256r1', customer, `agent-${name}-p256`);
		let ed25519;
		try {
			ed25519 = await engine.createKey('Ed25519', customer, `agent-${name}-ed25519`);
		} catch (error) {
			// Nothing was sent to the ledger: the first key is certainly unused.
			await this.discardKeys(engine, customer, [p256.kid]);
			throw error;
		}
		const document = buildAgentDidDocument({
			network: input.network,
			id: this.newId(),
			p256PublicKeyHex: p256.publicKeyHex,
			ed25519PublicKeyHex: ed25519.publicKeyHex,
		});
		let identifier;
		try {
			identifier = await engine.createDid(input.network, document, customer);
		} catch (error) {
			// The DID write failed: the two new keys belong to nothing. Remove them if the write cannot have landed.
			if (
				await this.writeCannotHaveLanded(error, async () => {
					const resolution = await engine.resolveDid(document.id);
					return !resolution.didDocument;
				})
			) {
				await this.discardKeys(engine, customer, [p256.kid, ed25519.kid]);
			}
			throw error;
		}

		let created: AgentRecord;
		try {
			created = await this.store.createAgent({
				customerId: customer.customerId,
				did: identifier.did,
				name,
				description: input.description,
				actsForDid: input.actsForDid,
				capabilities,
				useCase: input.useCase?.trim() || undefined,
			});
		} catch (error) {
			throw upstreamFailure(
				`The DID ${identifier.did} was created but the agent could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`
			);
		}
		await this.record(customer, created.agentId, 'registered', ctx, {});
		return created;
	}

	/** One page of the customer's agents, filtered by `q` in the query, each with its authority summary. */
	async list(customerIn: CustomerEntity | undefined, page: { limit: number; offset: number; q?: string }) {
		const customer = requireCustomer(customerIn);
		const { items, total } = await this.store.listAgents(customer.customerId, page);
		const grants = await this.store.listGrantsForAgents(
			customer.customerId,
			items.map((agent) => agent.agentId)
		);
		const now = this.now();
		return {
			total,
			items: items.map((agent) => ({
				agent,
				authoritySummary: this.authoritySummary(
					agent,
					grants.filter((grant) => grant.agentId === agent.agentId),
					now
				),
			})),
		};
	}

	async get(customerIn: CustomerEntity | undefined, agentId: string): Promise<AgentRecord> {
		const customer = requireCustomer(customerIn);
		return this.owned(customer, agentId);
	}

	/** The agent with its authority summary and the URL of its published card (null when none is published). */
	async detail(customerIn: CustomerEntity | undefined, agentId: string) {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		const grants = await this.store.listGrants(customer.customerId, agentId);
		const published = await this.store.latestPublishedCard(customer.customerId, agentId);
		return {
			agent,
			authoritySummary: this.authoritySummary(agent, grants, this.now()),
			cardUrl: published?.resourceId
				? `${this.resolverUrl()}${agent.did}/resources/${published.resourceId}`
				: null,
		};
	}

	async update(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		patch: {
			name?: string;
			description?: string | null;
			actsForDid?: string | null;
			status?: string;
			capabilities?: CapabilitiesInput;
		}
	): Promise<AgentRecord> {
		const customer = requireCustomer(customerIn);
		const current = await this.owned(customer, agentId);
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
		if (patch.capabilities !== undefined) {
			change.capabilities = mergeCapabilities(current.capabilities, patch.capabilities);
		}
		if (patch.status !== undefined) {
			if (!(AGENT_SETTABLE_STATUSES as readonly string[]).includes(patch.status)) {
				throw badRequest(`status must be one of: ${AGENT_SETTABLE_STATUSES.join(', ')}`);
			}
			change.status = patch.status;
		}
		if (Object.keys(change).length === 0) throw badRequest('Nothing to update');
		// Payment address bindings follow the agent's status on their status lists (suspended while the agent is
		// suspended, valid again on reactivation), so a relying party stops accepting them. If the write cannot
		// be made the status does not change.
		if (change.status !== undefined && change.status !== current.status) {
			await this.setLiveBindingsStatus(
				customer,
				agentId,
				change.status === 'suspended' ? STATUS_SUSPENDED : STATUS_VALID
			);
		}
		const updated = await this.store.updateAgent(customer.customerId, agentId, change);
		if (!updated) throw notFound();
		return updated;
	}

	/**
	 * Soft-deletes the agent. Live authority grants and live payment address bindings are revoked first, so a
	 * deleted agent cannot keep using a credential: if that cannot be done (no engine capability, ledger failure)
	 * the agent is NOT deleted.
	 */
	async remove(
		customerIn: CustomerEntity | undefined,
		agentId: string
	): Promise<{ revokedGrants: number; revokedPaymentAddresses: number }> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const live = await this.store.listLiveGrants(customer.customerId, agentId);
		for (const grant of live) await this.revokeLoaded(customer, grant);
		const bindings = await this.store.listLiveBindings(customer.customerId, agentId);
		for (const binding of bindings) await this.revokeBindingLoaded(customer, binding);
		if (!(await this.store.softDeleteAgent(customer.customerId, agentId))) throw notFound();
		return { revokedGrants: live.length, revokedPaymentAddresses: bindings.length };
	}

	// --- Cards --------------------------------------------------------------------------------------------

	async createCard(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: { card: AgentCardInput; publish?: boolean; alg?: 'ES256' | 'EdDSA' },
		ctx: CallContext = {}
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
		// Decided before the new card is saved: the first publication is `card-published`, every later version
		// (published or not) is `card-updated`.
		const firstPublication = input.publish && !(await this.store.latestPublishedCard(customer.customerId, agentId));
		const created = await this.store.createCard({
			agentId,
			customerId: customer.customerId,
			version,
			card: signed.card as unknown as Record<string, unknown>,
			jws: signed.jws,
			resourceId,
			publishedAt,
		});
		await this.record(customer, agentId, firstPublication ? 'card-published' : 'card-updated', ctx, {
			version,
			published: Boolean(input.publish),
		});
		return created;
	}

	async getCard(customerIn: CustomerEntity | undefined, agentId: string, version?: number): Promise<AgentCardRecord> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const card = await this.store.getCard(customer.customerId, agentId, version);
		if (!card) throw notFound('Agent card');
		return card;
	}

	// --- Authority ----------------------------------------------------------------------------------------

	/** The agent's grants, newest first, with a status worked out from `revokedAt`, `expiresAt` and the agent's status. */
	async listAuthority(customerIn: CustomerEntity | undefined, agentId: string) {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		const now = this.now();
		const grants = await this.store.listGrants(customer.customerId, agentId);
		return grants.map((grant) => ({
			id: grant.id,
			grantType: grant.grantType,
			status: this.grantStatus(grant, agent, now),
			summary: summariseGrant(grant),
			createdAt: grant.createdAt,
			expiresAt: grant.expiresAt ?? null,
			revokedAt: grant.revokedAt ?? null,
		}));
	}

	async grantAuthority(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: GrantInput,
		ctx: CallContext = {}
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
		if (expiresAt) this.assertWithinMaxLifetime(expiresAt, this.now());
		// A cheap early refusal, before any key is used. The store repeats the check under a row lock, which is
		// what makes it race-safe.
		if (input.grantType === 'acts-for' && (await this.hasLiveActsFor(customer.customerId, agentId))) {
			throw actsForExists();
		}
		const engine = await this.engineFor(customer);
		if (input.grantType === 'delegation') {
			const issued = await this.issueDelegation(customer, engine, agent, issuerDid, input, expiresAt);
			await this.record(customer, agentId, 'authority-granted', ctx, {
				grantId: issued.grant.id,
				grantType: 'delegation',
			});
			return issued;
		}

		requireCapabilities(engine, 'signWithDidKey', 'createTokenStatusList', 'setTokenStatus');

		// The claims first, so a bad request costs nothing: no key is used and no list index is taken.
		const agentDid = await resolveDidKeys(engine, agent.did);
		const agentKey = agentDid.keys.find((key) => key.alg === 'ES256');
		const { vct, specific } = this.claimsFor(input, agentKey?.jwk);
		// Already validated by claimsFor. Kept so the settlement view needs no copy of the signed mandate.
		const mandate = input.grantType === 'mandate' ? validateOpenMandateRequest(input.mandate) : undefined;
		const policySummary = mandate?.ok ? (summariseMandate(mandate.mandate) ?? undefined) : undefined;
		const claimsToKeep = this.claimsToKeep(
			input.grantType,
			specific,
			mandate?.ok ? mandate.mandate.type : undefined
		);
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
			policySummary,
			claims: claimsToKeep,
		});
		await this.record(customer, agentId, 'authority-granted', ctx, {
			grantId: grant.id,
			grantType: input.grantType,
		});
		return { grant: { ...grant, issuerDid }, credential: { format: 'sd-jwt-vc', value: compact } };
	}

	async revokeAuthority(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		grantId: string,
		ctx: CallContext = {}
	): Promise<AuthorityGrantWithStatus> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		if ((await this.store.countGrants(customer.customerId, agentId, grantId)) === 0)
			throw notFound('Authority grant');
		const grant = await this.store.getGrant(customer.customerId, agentId, grantId);
		if (!grant) throw notFound('Authority grant');
		const wasLive = !grant.revokedAt;
		const revoked = await this.revokeLoaded(customer, grant);
		if (wasLive) {
			await this.record(customer, agentId, 'authority-revoked', ctx, { grantId, grantType: grant.grantType });
		}
		return revoked;
	}

	/**
	 * Changes a grant's expiry without revoking it. Grants are signed credentials, so this issues a replacement
	 * with the new expiry and, in the same operation, revokes the old one on its Token Status List; the grant keeps
	 * its id. Order: the replacement is signed first, then the old entry is revoked on the ledger, then Studio's
	 * record is switched over, so a failure at any step leaves the old credential as the only valid one (or, if the
	 * last step fails, neither valid: it fails closed, and re-granting fixes it).
	 *
	 * Not possible for grants whose claims Studio did not keep (made before this was built; `acts-for` has none to
	 * keep) or for KYA-OS delegations (no status list entry, so the old credential cannot be superseded): 409.
	 */
	async changeGrantExpiry(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		grantId: string,
		input: { expiresAt: unknown },
		ctx: CallContext = {}
	): Promise<IssuedAuthority & { replaced: { from: Date | null; to: Date } }> {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		if ((await this.store.countGrants(customer.customerId, agentId, grantId)) === 0)
			throw notFound('Authority grant');
		const grant = await this.store.getGrant(customer.customerId, agentId, grantId);
		if (!grant) throw notFound('Authority grant');
		const now = this.now();
		if (grant.revokedAt) throw conflict('The grant is revoked');
		if (grant.expiresAt && grant.expiresAt <= now) throw conflict('The grant has expired');
		if (agent.status !== 'active') throw conflict(`The agent is ${agent.status}`);

		const expiresAt = typeof input.expiresAt === 'string' ? new Date(input.expiresAt) : undefined;
		if (!expiresAt || Number.isNaN(expiresAt.getTime())) throw badRequest('expiresAt must be an ISO 8601 date');
		if (expiresAt <= now) throw badRequest('expiresAt must be in the future');
		this.assertWithinMaxLifetime(expiresAt, now);

		if (grant.grantType === 'delegation') {
			throw conflict(
				'KYA-OS delegations carry no status list entry, so a replacement cannot supersede the old credential. Revoke it and grant again.'
			);
		}
		if (!grant.issuerDid || !grant.statusListUri || grant.statusIndex === null || grant.statusIndex === undefined) {
			throw conflict('This grant has no status list entry, so its credential cannot be superseded');
		}
		const stored = (grant.claims ?? {}) as Record<string, unknown>;
		const needsClaims = grant.grantType === 'tool-scope' || grant.grantType === 'mandate';
		if (needsClaims && Object.keys(stored).length === 0) {
			throw conflict(
				'This grant was made before expiry changes were supported and its claims were not kept. Revoke it and grant again.'
			);
		}

		const previousExpiry = grant.expiresAt ?? null;
		const lock = `grant:${grantId}`;
		if (this.inFlight.has(lock)) throw conflict('A change to this grant is already in progress');
		this.inFlight.add(lock);
		try {
			const engine = await this.engineFor(customer);
			requireCapabilities(engine, 'signWithDidKey', 'createTokenStatusList', 'setTokenStatus');
			const { vct, specific } = await this.claimsForReissue(engine, agent, grant.grantType, stored);
			const issuer = await resolveDidKeys(engine, grant.issuerDid);
			if (issuer.deactivated) throw conflict('The issuer DID is deactivated');
			const issuerKey = assertionKeys(issuer)[0];
			if (!issuerKey) throw upstreamFailure(`The issuer DID ${grant.issuerDid} has no usable key`);

			const { list, index } = await this.takeStatusIndex(customer, engine, grant.issuerDid);
			const claims: Record<string, unknown> = {
				iss: grant.issuerDid,
				sub: agent.did,
				vct,
				...specific,
				iat: Math.floor(now.getTime() / 1000),
				exp: Math.floor(expiresAt.getTime() / 1000),
				status: { status_list: { idx: index, uri: list.uri } },
			};
			const compact = await issueSdJwtVc(didSigner(engine, customer, grant.issuerDid, issuerKey), claims);

			await engineMethod(engine, 'setTokenStatus')(
				grant.issuerDid,
				grant.statusListUri,
				[{ index: grant.statusIndex, status: STATUS_REVOKED }],
				customer
			);
			const replaced = await this.store.replaceGrantCredential(customer.customerId, agentId, grantId, {
				issuerDid: grant.issuerDid,
				subjectDid: agent.did,
				format: 'sd-jwt-vc',
				vct,
				statusListId: list.registryId,
				statusIndex: index,
				statusUri: list.uri,
				expiresAt,
			});
			if (!replaced) throw notFound('Authority grant');
			await this.record(customer, agentId, 'authority-expiry-changed', ctx, {
				grantId,
				grantType: grant.grantType,
				from: previousExpiry?.toISOString() ?? null,
				to: expiresAt.toISOString(),
			});
			return {
				grant: replaced,
				credential: { format: 'sd-jwt-vc', value: compact },
				replaced: { from: previousExpiry, to: expiresAt },
			};
		} finally {
			this.inFlight.delete(lock);
		}
	}

	// --- Keys ---------------------------------------------------------------------------------------------

	/** The agent's keys, from its DID document and its key events. Public material only. */
	async listKeys(customerIn: CustomerEntity | undefined, agentId: string): Promise<AgentKeyView[]> {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		const engine = await this.engineFor(customer);
		const resolved = await resolveDidKeys(engine, agent.did);
		return viewKeys(
			resolved.document,
			resolved.deactivated,
			await this.keyHistory(customer, agentId),
			agent.createdAt
		);
	}

	/**
	 * Rotates one key: a new key of the same type is made by the engine, the DID document on the ledger is updated
	 * (the old key signs the update, through the engine's payer lock and write queue), and the old key is left in the
	 * document but out of `authentication` and `assertionMethod`, so it is `rotated` and still verifies earlier
	 * credentials. Existing mandates stay bound to the key they were issued for: grant them again to bind a new key.
	 */
	async rotateKey(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: { keyId: unknown; confirm: unknown },
		ctx: CallContext = {}
	) {
		const customer = requireCustomer(customerIn);
		if (input.confirm !== true) throw badRequest('confirm must be true to rotate a key');
		if (typeof input.keyId !== 'string' || input.keyId.length === 0 || input.keyId.length > 512) {
			throw badRequest('keyId is required');
		}
		const agent = await this.owned(customer, agentId);
		return this.withAgentLock(agentId, async () => {
			const engine = await this.engineFor(customer);
			const resolved = await resolveDidKeys(engine, agent.did);
			if (resolved.deactivated) throw conflict('The agent DID is deactivated');
			const wanted = input.keyId as string;
			const keyId = wanted.startsWith('#')
				? `${agent.did}${wanted}`
				: wanted.includes('#')
					? wanted
					: `${agent.did}#${wanted}`;
			const keys = viewKeys(resolved.document, false, await this.keyHistory(customer, agentId), agent.createdAt);
			const key = keys.find((candidate) => candidate.keyId === keyId);
			if (!key) throw notFound('Key');
			if (key.status !== 'active') throw conflict(`The key is ${key.status}, only an active key can be rotated`);

			const created = await engine.createKey(
				key.type === 'P-256' ? 'Secp256r1' : 'Ed25519',
				customer,
				`agent-${agent.name}-${key.type === 'P-256' ? 'p256' : 'ed25519'}-rotated`
			);
			const fragment = nextKeyFragment(resolved.document);
			const document = documentWithNewKey(
				resolved.document,
				{ fragment, type: key.type, publicKeyHex: created.publicKeyHex },
				keyId
			);
			let identifier;
			try {
				identifier = await engine.updateDid(document, customer);
			} catch (error) {
				await this.discardNewKeyAfterFailedUpdate(engine, customer, agent.did, fragment, created.kid, error);
				throw error;
			}
			const newKeyId = `${agent.did}#${fragment}`;
			const txHash = typeof identifier?.txHash === 'string' ? identifier.txHash : null;
			await this.record(customer, agentId, 'key-rotated', ctx, { oldKeyId: keyId, newKeyId, keyType: key.type });
			await this.audit(customer, ctx, 'agent.key.rotated', { agentId, oldKeyId: keyId, newKeyId });
			return { oldKeyId: keyId, newKeyId, didUpdate: { txHash } };
		});
	}

	/**
	 * Adds an Ed25519 key to an agent that has only a P-256 key, with the same ledger rules as a rotation. 409 when
	 * an active Ed25519 key already exists. (The reverse, adding P-256, is not offered.)
	 */
	async addKey(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: { type: unknown },
		ctx: CallContext = {}
	): Promise<AgentKeyView> {
		const customer = requireCustomer(customerIn);
		if (input.type !== 'Ed25519') throw badRequest('type must be Ed25519');
		const agent = await this.owned(customer, agentId);
		return this.withAgentLock(agentId, async () => {
			const engine = await this.engineFor(customer);
			const resolved = await resolveDidKeys(engine, agent.did);
			if (resolved.deactivated) throw conflict('The agent DID is deactivated');
			const history = await this.keyHistory(customer, agentId);
			const existing = viewKeys(resolved.document, false, history, agent.createdAt);
			if (existing.some((key) => key.type === 'Ed25519' && key.status === 'active')) {
				throw conflict('The agent already has an Ed25519 key');
			}
			const created = await engine.createKey('Ed25519', customer, `agent-${agent.name}-ed25519-added`);
			const fragment = nextKeyFragment(resolved.document);
			const document = documentWithNewKey(resolved.document, {
				fragment,
				type: 'Ed25519',
				publicKeyHex: created.publicKeyHex,
			});
			try {
				await engine.updateDid(document, customer);
			} catch (error) {
				await this.discardNewKeyAfterFailedUpdate(engine, customer, agent.did, fragment, created.kid, error);
				throw error;
			}
			const keyId = `${agent.did}#${fragment}`;
			const addedAt = this.now();
			await this.record(customer, agentId, 'key-added', ctx, { keyId, keyType: 'Ed25519' });
			await this.audit(customer, ctx, 'agent.key.added', { agentId, keyId, keyType: 'Ed25519' });
			const added = viewKeys(
				document,
				false,
				{ ...history, createdAt: new Map([[keyId, addedAt]]) },
				agent.createdAt
			).find((key) => key.keyId === keyId);
			if (!added) throw upstreamFailure('The new key is not in the updated DID document');
			return added;
		});
	}

	// --- Activity -----------------------------------------------------------------------------------------

	/** The agent's events, newest first. Customer-scoped; never staff audit data. */
	async listActivity(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		page: { limit: number; offset: number }
	): Promise<{ total: number; events: AgentEventRecord[] }> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		const { items, total } = await this.store.listEvents(customer.customerId, agentId, page);
		return { total, events: items };
	}

	// --- Payment addresses (Proposed, x402) ---------------------------------------------------------------

	/** The agent's bindings, newest first. `suspended` while the agent is suspended. No credential is returned. */
	async listPaymentAddresses(customerIn: CustomerEntity | undefined, agentId: string) {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		const bindings = await this.store.listBindings(customer.customerId, agentId);
		return bindings.map((binding) => ({
			id: binding.id,
			account: binding.account,
			status: binding.revokedAt ? 'revoked' : agent.status === 'suspended' ? 'suspended' : 'active',
			createdAt: binding.createdAt,
			revokedAt: binding.revokedAt ?? null,
		}));
	}

	/**
	 * Binds a payment address (CAIP-10) to the agent with a `PaymentAddressBinding` SD-JWT VC signed by the agent's
	 * own key, with a Token Status List entry so it can be revoked. cheqd's own vocabulary, not an x402 standard.
	 * The binding is the agent's assertion: it does not prove control of the wallet. Returned once, never stored.
	 */
	async bindPaymentAddress(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		input: { account: unknown }
	): Promise<IssuedPaymentAddressBinding> {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		if (agent.status !== 'active') throw conflict(`The agent is ${agent.status}`);
		const parsed = parseCaip10(input.account);
		if (!parsed.ok) throw badRequest(parsed.error);
		const { account } = parsed.value;

		const engine = await this.engineFor(customer);
		requireCapabilities(engine, 'signWithDidKey', 'createTokenStatusList', 'setTokenStatus');

		// Everything that can be refused cheaply comes before a key is used or a list index is taken.
		const live = await this.store.listLiveBindings(customer.customerId, agentId);
		if (live.some((binding) => binding.account === account)) {
			throw conflict('This payment address is already bound to the agent');
		}
		if (live.length >= MAX_PAYMENT_ADDRESSES) {
			throw conflict(`An agent can have at most ${MAX_PAYMENT_ADDRESSES} payment addresses`);
		}
		const resolved = await resolveDidKeys(engine, agent.did);
		if (resolved.deactivated) throw conflict('The agent DID is deactivated');
		const key = resolved.keys.find((candidate) => candidate.alg === 'ES256') ?? assertionKeys(resolved)[0];
		if (!key) throw upstreamFailure('The agent DID has no usable signing key');

		const { list, index } = await this.takeStatusIndex(customer, engine, agent.did, 'agent-payment-binding');
		const claims = {
			iss: agent.did,
			sub: agent.did,
			vct: VCT.paymentAddressBinding,
			account,
			iat: Math.floor(this.now().getTime() / 1000),
			status: { status_list: { idx: index, uri: list.uri } },
		};
		const compact = await issueSdJwtVc(didSigner(engine, customer, agent.did, key), claims);
		const binding = await this.store.createBinding({
			agentId,
			customerId: customer.customerId,
			account,
			issuerDid: agent.did,
			subjectDid: agent.did,
			statusListId: list.registryId,
			statusIndex: index,
			statusUri: list.uri,
		});
		return { binding, credential: { format: 'sd-jwt-vc', value: compact } };
	}

	async revokePaymentAddress(
		customerIn: CustomerEntity | undefined,
		agentId: string,
		bindingId: string
	): Promise<PaymentAddressBindingWithStatus> {
		const customer = requireCustomer(customerIn);
		await this.owned(customer, agentId);
		if ((await this.store.countBindings(customer.customerId, agentId, bindingId)) === 0)
			throw notFound('Payment address binding');
		const binding = await this.store.getBinding(customer.customerId, agentId, bindingId);
		if (!binding) throw notFound('Payment address binding');
		return this.revokeBindingLoaded(customer, binding);
	}

	// --- Settlement (Proposed, x402, read-only) -----------------------------------------------------------

	/**
	 * The agent's open AP2 payment mandate as an x402 payment policy. Derived, not stored: the policy summary kept
	 * with the mandate grant when it was issued, and the live payment address bindings. 404 when there is no open
	 * mandate (none granted, revoked, expired, or granted before summaries were kept).
	 */
	async settlement(customerIn: CustomerEntity | undefined, agentId: string): Promise<SettlementView> {
		const customer = requireCustomer(customerIn);
		const agent = await this.owned(customer, agentId);
		const now = this.now();
		const open = (await this.store.listLiveGrants(customer.customerId, agentId))
			.filter(
				(grant) =>
					grant.grantType === 'mandate' && grant.policySummary && (!grant.expiresAt || grant.expiresAt > now)
			)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
		if (!open?.policySummary) throw notFound('Open mandate');
		// A suspended agent's addresses are not usable, so none are offered as pays-from.
		const bindings =
			agent.status === 'active' ? await this.store.listLiveBindings(customer.customerId, agentId) : [];
		return buildSettlementView({
			agentId,
			agentStatus: agent.status,
			grant: open,
			summary: open.policySummary,
			bindings,
		});
	}

	// --- Internals ----------------------------------------------------------------------------------------

	/** Best effort: the change it describes has already happened, so a failed event write must not undo or hide it. */
	private async record(
		customer: CustomerEntity,
		agentId: string,
		type: AgentEventType,
		ctx: CallContext,
		detail: Record<string, unknown>
	): Promise<void> {
		try {
			await this.store.addEvent({
				agentId,
				customerId: customer.customerId,
				type,
				actor: ctx.actor ?? 'owner',
				detail: sanitiseEventDetail(type, detail),
			});
		} catch (error) {
			console.error(
				`Could not record the ${type} event: ${error instanceof Error ? error.message : 'unknown error'}`
			);
		}
	}

	/** The append-only audit log, for key changes. Best effort for the same reason as `record`. */
	private async audit(
		customer: CustomerEntity,
		ctx: CallContext,
		action: string,
		metadata: Record<string, unknown>
	): Promise<void> {
		try {
			await this.store.recordAudit({
				customerId: customer.customerId,
				actor: ctx.userId ? `${ctx.actor ?? 'owner'}:${ctx.userId}` : (ctx.actor ?? 'owner'),
				action,
				reason: 'Customer request through the agent API',
				metadata,
			});
		} catch (error) {
			console.error(
				`Could not write the audit entry ${action}: ${error instanceof Error ? error.message : 'unknown error'}`
			);
		}
	}

	/**
	 * True when a failed ledger write is known not to have been included: a payer with no funds, a busy payer lock,
	 * or (for any other error) when `provedAbsent` shows the change is not on the ledger. A timeout is never safe:
	 * the transaction may land later. Anything that cannot be checked counts as "may have landed".
	 */
	private async writeCannotHaveLanded(error: unknown, provedAbsent: () => Promise<boolean>): Promise<boolean> {
		if (unfundedPayerFailure(error)) return true;
		if (error instanceof LedgerUnavailableError) return !error.idempotencyKey;
		if (isTimeoutError(error)) return false;
		try {
			return await provedAbsent();
		} catch {
			return false;
		}
	}

	/**
	 * Best effort: removes keys made for a write that failed, so they are not left behind. Never throws, so it can
	 * not hide the error that caused it. An engine without `deleteUnusedKey` leaves them (logged).
	 */
	private async discardKeys(engine: IdentityEngine, customer: CustomerEntity, kids: string[]): Promise<void> {
		for (const kid of kids) {
			try {
				if (!engine.deleteUnusedKey) {
					console.error(
						`Could not remove the unused key ${kid}: the ${engine.name} engine cannot delete keys`
					);
					continue;
				}
				await engine.deleteUnusedKey(kid, customer);
			} catch (error) {
				console.error(
					`Could not remove the unused key ${kid}: ${error instanceof Error ? error.message : 'unknown error'}`
				);
			}
		}
	}

	/** After a failed DID update: the new key is unused unless the update landed (checked on the ledger). */
	private async discardNewKeyAfterFailedUpdate(
		engine: IdentityEngine,
		customer: CustomerEntity,
		did: string,
		fragment: string,
		kid: string,
		error: unknown
	): Promise<void> {
		const cannotHaveLanded = await this.writeCannotHaveLanded(error, async () => {
			const resolution = await engine.resolveDid(did);
			const methods = (resolution.didDocument?.verificationMethod ?? []) as Array<{ id?: string }>;
			return Boolean(resolution.didDocument) && !methods.some((method) => method.id === `${did}#${fragment}`);
		});
		if (cannotHaveLanded) await this.discardKeys(engine, customer, [kid]);
	}

	/** One key change at a time per agent in this process: the second gets a 409 instead of racing the first. */
	private async withAgentLock<T>(agentId: string, work: () => Promise<T>): Promise<T> {
		const lock = `agent:${agentId}`;
		if (this.inFlight.has(lock)) throw conflict('A key change is already in progress for this agent');
		this.inFlight.add(lock);
		try {
			return await work();
		} finally {
			this.inFlight.delete(lock);
		}
	}

	private async keyHistory(customer: CustomerEntity, agentId: string): Promise<KeyHistory> {
		const { items } = await this.store.listEvents(customer.customerId, agentId, {
			limit: 500,
			offset: 0,
			types: ['key-added', 'key-rotated'],
		});
		const history: KeyHistory = { createdAt: new Map(), rotatedAt: new Map() };
		// Newest first: keep the earliest creation and the latest rotation of each key.
		for (const event of items) {
			const detail = event.detail as { keyId?: string; oldKeyId?: string; newKeyId?: string };
			if (event.type === 'key-added' && detail.keyId) history.createdAt.set(detail.keyId, event.createdAt);
			if (event.type === 'key-rotated') {
				if (detail.newKeyId) history.createdAt.set(detail.newKeyId, event.createdAt);
				if (detail.oldKeyId && !history.rotatedAt.has(detail.oldKeyId)) {
					history.rotatedAt.set(detail.oldKeyId, event.createdAt);
				}
			}
		}
		return history;
	}

	private assertWithinMaxLifetime(expiresAt: Date, now: Date): void {
		const maxDays = this.maxGrantLifetimeDays();
		if (expiresAt.getTime() > now.getTime() + maxDays * DAY_MS) {
			throw badRequest(`expiresAt is later than the platform maximum (${maxDays} days from now)`);
		}
	}

	/** An acts-for grant that is active or suspended: not revoked and not expired. */
	private async hasLiveActsFor(customerId: string, agentId: string): Promise<boolean> {
		const now = this.now();
		const live = await this.store.listLiveGrants(customerId, agentId);
		return live.some((grant) => grant.grantType === 'acts-for' && (!grant.expiresAt || grant.expiresAt > now));
	}

	private grantStatus(
		grant: { revokedAt?: Date | null; expiresAt?: Date | null },
		agent: AgentRecord,
		now: Date
	): 'active' | 'revoked' | 'expired' | 'suspended' {
		if (grant.revokedAt) return 'revoked';
		if (grant.expiresAt && grant.expiresAt <= now) return 'expired';
		// Studio only: a suspended agent's grants are shown as suspended (the credentials themselves are unchanged).
		return agent.status === 'suspended' ? 'suspended' : 'active';
	}

	/** Counts of the agent's active (not revoked, not expired, agent not suspended) grants, and the DID it acts for. */
	private authoritySummary(agent: AgentRecord, grants: AuthorityGrantWithStatus[], now: Date): AuthoritySummary {
		// Same rule as the grant list: only `active` grants count, so a suspended agent's grants do not.
		const active = grants.filter((grant) => this.grantStatus(grant, agent, now) === 'active');
		const count = (type: string) => active.filter((grant) => grant.grantType === type).length;
		// Newest first: the first acts-for grant is the latest. Its issuer is the DID the agent acts for.
		const actsFor = active.find((grant) => grant.grantType === 'acts-for');
		return {
			actsFor: actsFor ? (actsFor.issuerDid ?? agent.actsForDid ?? null) : null,
			grantCounts: {
				actsFor: count('acts-for'),
				mandate: count('mandate'),
				delegation: count('delegation'),
				toolScope: count('tool-scope'),
			},
		};
	}

	/** The grant-specific claims worth keeping for a reissue: policy only, never `cnf`. */
	private claimsToKeep(
		grantType: GrantType,
		specific: Record<string, unknown>,
		mandateType: string | undefined
	): Record<string, unknown> | undefined {
		if (grantType === 'tool-scope') return { tools: specific.tools };
		if (grantType === 'mandate') return { constraints: specific.constraints, mandateType };
		return undefined;
	}

	/** The vct and claims for a replacement credential, from what was kept; a mandate is rebound to the agent's current P-256 key. */
	private async claimsForReissue(
		engine: IdentityEngine,
		agent: AgentRecord,
		grantType: string,
		stored: Record<string, unknown>
	): Promise<{ vct: string; specific: Record<string, unknown> }> {
		switch (grantType) {
			case 'acts-for':
				return { vct: VCT.actsFor, specific: {} };
			case 'tool-scope':
				return { vct: VCT.toolScope, specific: { tools: stored.tools } };
			case 'mandate': {
				const resolved = await resolveDidKeys(engine, agent.did);
				const key = resolved.keys.find((candidate) => candidate.alg === 'ES256');
				if (!key) throw upstreamFailure('The agent DID has no P-256 key to bind the mandate to');
				return {
					vct: stored.mandateType === 'checkout' ? VCT.checkoutOpenMandate : VCT.paymentOpenMandate,
					specific: { constraints: stored.constraints, cnf: { jwk: key.jwk } },
				};
			}
			default:
				throw conflict(`A ${grantType} grant cannot have its expiry changed`);
		}
	}

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
		issuerDid: string,
		listNamePrefix = 'agent-authority'
	): Promise<{ list: TokenStatusListRecord; index: number }> {
		for (let attempt = 0; attempt < 2; attempt++) {
			let list = await this.store.findOpenStatusList(customer.customerId, issuerDid);
			if (!list) {
				const name = `${listNamePrefix}-${this.newId().slice(0, 8)}`;
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

	private async revokeBindingLoaded(
		customer: CustomerEntity,
		binding: PaymentAddressBindingWithStatus
	): Promise<PaymentAddressBindingWithStatus> {
		if (binding.revokedAt) return binding;
		if (
			binding.statusListUri &&
			binding.issuerDid &&
			binding.statusIndex !== null &&
			binding.statusIndex !== undefined
		) {
			const engine = await this.engineFor(customer);
			requireCapabilities(engine, 'setTokenStatus');
			await engineMethod(engine, 'setTokenStatus')(
				binding.issuerDid,
				binding.statusListUri,
				[{ index: binding.statusIndex, status: STATUS_REVOKED }],
				customer
			);
		}
		const revoked = await this.store.markBindingRevoked(customer.customerId, binding.agentId, binding.id);
		if (!revoked) throw notFound('Payment address binding');
		return revoked;
	}

	/** Suspends (2) or restores (0) the status list entries of the agent's live bindings. A no-op with none. */
	private async setLiveBindingsStatus(customer: CustomerEntity, agentId: string, status: 0 | 2): Promise<void> {
		const live = (await this.store.listLiveBindings(customer.customerId, agentId)).filter(
			(binding) =>
				binding.statusListUri &&
				binding.issuerDid &&
				binding.statusIndex !== null &&
				binding.statusIndex !== undefined
		);
		if (live.length === 0) return;
		const engine = await this.engineFor(customer);
		requireCapabilities(engine, 'setTokenStatus');
		const setStatus = engineMethod(engine, 'setTokenStatus');
		for (const binding of live) {
			await setStatus(
				binding.issuerDid as string,
				binding.statusListUri as string,
				[{ index: binding.statusIndex as number, status }],
				customer
			);
		}
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
