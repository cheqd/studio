import { ILike, In, IsNull, Not } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Connection } from '../../database/connection/connection.js';
import { AgentEntity } from '../../database/entities/agent.entity.js';
import { AgentCardEntity } from '../../database/entities/agent-card.entity.js';
import { AdminAuditLogEntity } from '../../database/entities/admin-audit-log.entity.js';
import { AgentEventEntity } from '../../database/entities/agent-event.entity.js';
import { AuthorityGrantEntity } from '../../database/entities/authority-grant.entity.js';
import { PaymentAddressBindingEntity } from '../../database/entities/payment-address-binding.entity.js';
import { IssuedCredentialEntity } from '../../database/entities/issued-credential.entity.js';
import { StatusRegistryEntity } from '../../database/entities/status-registry.entity.js';
import { IdentifierEntity } from '../../database/entities/identifier.entity.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import { recordActivation } from '../analytics/activation.js';
import { VCT, defaultCapabilities } from '../../types/agent.js';
import { StatusRegistryState } from '../../types/credential-status.js';
import { CredentialCategory } from '../../types/credential.js';
import type {
	AgentActor,
	AgentCapabilities,
	AgentCardRecord,
	AgentEventRecord,
	AgentEventType,
	AgentRecord,
	AuthorityGrantRecord,
	AuthorityGrantWithStatus,
	MandatePolicySummary,
	PaymentAddressBindingRecord,
	PaymentAddressBindingWithStatus,
	TokenStatusListRecord,
} from '../../types/agent.js';
import { actsForExists, conflict } from './agent-errors.js';

export interface NewAgent {
	customerId: string;
	did: string;
	name: string;
	description?: string;
	actsForDid?: string;
	capabilities?: AgentCapabilities;
	useCase?: string;
}

export interface AgentPatch {
	name?: string;
	description?: string | null;
	actsForDid?: string | null;
	capabilities?: AgentCapabilities;
	status?: string;
}

export interface NewAgentEvent {
	agentId: string;
	customerId: string;
	type: AgentEventType;
	actor: AgentActor;
	detail?: Record<string, unknown>;
}

export interface NewAuditEntry {
	customerId: string;
	/** `owner` or `api-key`, with the internal user id when known. Never an email. */
	actor: string;
	action: string;
	reason: string;
	metadata: Record<string, unknown>;
}

/** What replaces a grant's credential when its expiry changes. The grant keeps its id. */
export interface GrantReplacement {
	issuerDid: string;
	subjectDid: string;
	format: 'sd-jwt-vc' | 'jwt';
	vct: string;
	statusListId: string;
	statusIndex: number;
	statusUri: string;
	expiresAt: Date;
}

export interface NewAgentCard {
	agentId: string;
	customerId: string;
	version: number;
	card: Record<string, unknown>;
	jws?: string;
	resourceId?: string;
	publishedAt?: Date;
}

export interface NewGrant {
	agentId: string;
	customerId: string;
	grantType: string;
	issuerDid: string;
	subjectDid: string;
	format: 'sd-jwt-vc' | 'jwt';
	vct: string;
	statusListId?: string;
	statusIndex?: number;
	statusUri?: string;
	expiresAt?: Date;
	/** Payment mandates only: the non-secret policy summary for the settlement view. */
	policySummary?: MandatePolicySummary;
	/** Tool names, scopes or mandate constraints (never `cnf`), so an expiry change can reissue the credential. */
	claims?: Record<string, unknown>;
}

export interface NewPaymentAddressBinding {
	agentId: string;
	customerId: string;
	/** CAIP-10, already normalised. */
	account: string;
	/** The agent DID, which signs the binding and owns its status list. */
	issuerDid: string;
	subjectDid: string;
	statusListId: string;
	statusIndex: number;
	statusUri: string;
}

export interface NewStatusList {
	customerId: string;
	issuerDid: string;
	uri: string;
	name: string;
	size: number;
}

/**
 * Everything the agent service reads and writes. Every method that touches tenant data takes `customerId` and
 * filters on it; ownership is decided by COUNTS (`countAgents`), never by inspecting what a `find()` returned,
 * because `IdentifierService.find()` returns `[]` on error and `[rows, count]` otherwise and that has been
 * misread before (#885).
 */
export interface AgentStore {
	/** How many of the customer's identifiers have this DID (0 or 1). */
	countOwnedDids(customerId: string, did: string): Promise<number>;

	countAgents(customerId: string, agentId: string): Promise<number>;
	createAgent(agent: NewAgent): Promise<AgentRecord>;
	getAgent(customerId: string, agentId: string): Promise<AgentRecord | null>;
	/** `q` matches name, description or DID, case-insensitively, in the query itself (so `total` is the filtered count). */
	listAgents(
		customerId: string,
		page: { limit: number; offset: number; q?: string }
	): Promise<{ items: AgentRecord[]; total: number }>;
	updateAgent(customerId: string, agentId: string, patch: AgentPatch): Promise<AgentRecord | null>;
	softDeleteAgent(customerId: string, agentId: string): Promise<boolean>;

	latestCardVersion(customerId: string, agentId: string): Promise<number>;
	createCard(card: NewAgentCard): Promise<AgentCardRecord>;
	getCard(customerId: string, agentId: string, version?: number): Promise<AgentCardRecord | null>;
	/** The newest card of the agent that has been published (a DID-Linked Resource written), or null. */
	latestPublishedCard(customerId: string, agentId: string): Promise<AgentCardRecord | null>;

	countGrants(customerId: string, agentId: string, grantId: string): Promise<number>;
	getGrant(customerId: string, agentId: string, grantId: string): Promise<AuthorityGrantWithStatus | null>;
	listLiveGrants(customerId: string, agentId: string): Promise<AuthorityGrantWithStatus[]>;
	/** Every grant of the agent (live and revoked), newest first, with its issuer DID. No credential is loaded. */
	listGrants(customerId: string, agentId: string): Promise<AuthorityGrantWithStatus[]>;
	/** Every grant of several agents of one customer (one query), with issuer DIDs. No credential is loaded. */
	listGrantsForAgents(customerId: string, agentIds: string[]): Promise<AuthorityGrantWithStatus[]>;
	createGrant(grant: NewGrant): Promise<AuthorityGrantRecord>;
	markGrantRevoked(customerId: string, agentId: string, grantId: string): Promise<AuthorityGrantWithStatus | null>;
	/**
	 * In one transaction: records a new credential for the grant, points the grant at it (new status list entry and
	 * expiry), and marks the old credential revoked. The grant id does not change. Null when the grant is not found.
	 */
	replaceGrantCredential(
		customerId: string,
		agentId: string,
		grantId: string,
		replacement: GrantReplacement
	): Promise<AuthorityGrantWithStatus | null>;

	addEvent(event: NewAgentEvent): Promise<AgentEventRecord>;
	/** Newest first. */
	listEvents(
		customerId: string,
		agentId: string,
		page: { limit: number; offset: number; types?: AgentEventType[] }
	): Promise<{ items: AgentEventRecord[]; total: number }>;
	/**
	 * Records a customer-initiated change that touches keys or the ledger in the append-only audit log. Failure is
	 * the caller's to log: the ledger write it describes has already happened.
	 */
	recordAudit(entry: NewAuditEntry): Promise<void>;

	countBindings(customerId: string, agentId: string, bindingId: string): Promise<number>;
	getBinding(customerId: string, agentId: string, bindingId: string): Promise<PaymentAddressBindingWithStatus | null>;
	/** Every binding of the agent (live and revoked), newest first. Rows only: no credential is loaded. */
	listBindings(customerId: string, agentId: string): Promise<PaymentAddressBindingRecord[]>;
	listLiveBindings(customerId: string, agentId: string): Promise<PaymentAddressBindingWithStatus[]>;
	/** Throws a 409 `conflict` when the account is already bound to the agent and not revoked. */
	createBinding(binding: NewPaymentAddressBinding): Promise<PaymentAddressBindingRecord>;
	markBindingRevoked(
		customerId: string,
		agentId: string,
		bindingId: string
	): Promise<PaymentAddressBindingWithStatus | null>;

	/** An active Token Status List of this issuer with room left, or null. */
	findOpenStatusList(customerId: string, issuerDid: string): Promise<TokenStatusListRecord | null>;
	createStatusList(list: NewStatusList): Promise<TokenStatusListRecord>;
	/** Hands out the next index of a list atomically, or null when the list is full. */
	reserveStatusIndex(customerId: string, registryId: string): Promise<number | null>;
}

const TOKEN_STATUS_LIST = 'TokenStatusList';

/**
 * TypeORM drops a `where` key whose value is `undefined`, which turns "this customer's agent" into "any agent".
 * Every tenant-scoped method checks its identifiers first so that cannot happen.
 */
function need(...values: Array<string | undefined>): void {
	if (values.some((value) => typeof value !== 'string' || value.length === 0)) {
		throw new Error('Refusing a tenant-scoped query with a missing identifier');
	}
}

const toAgent = (
	row: AgentEntity & { customer?: CustomerEntity; identifier?: { did: string } },
	customerId: string
): AgentRecord => ({
	agentId: row.agentId,
	customerId,
	did: row.identifier?.did as string,
	name: row.name,
	description: row.description ?? null,
	actsForDid: row.actsForDid ?? null,
	capabilities: { ...defaultCapabilities(), ...(row.capabilities as Partial<AgentCapabilities> | undefined) },
	useCase: row.useCase ?? null,
	status: row.status,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
	deletedAt: row.deletedAt ?? null,
});

const toCard = (row: AgentCardEntity, agentId: string, customerId: string): AgentCardRecord => ({
	id: row.id,
	agentId,
	customerId,
	version: row.version,
	card: row.card,
	jws: row.jws ?? null,
	resourceId: row.resourceId ?? null,
	publishedAt: row.publishedAt ?? null,
	createdAt: row.createdAt,
});

const toGrant = (row: AuthorityGrantEntity, agentId: string, customerId: string): AuthorityGrantWithStatus => ({
	id: row.id,
	agentId,
	customerId,
	grantType: row.grantType,
	issuedCredentialId: row.issuedCredential?.issuedCredentialId ?? null,
	statusListId: row.statusList?.registryId ?? null,
	statusIndex: row.statusIndex ?? null,
	expiresAt: row.expiresAt ?? null,
	revokedAt: row.revokedAt ?? null,
	policySummary: (row.policySummary as MandatePolicySummary | undefined) ?? null,
	claims: row.claims ?? null,
	createdAt: row.createdAt,
	issuerDid: row.statusList?.identifier?.did ?? null,
	statusListUri: row.statusList?.uri ?? null,
});

const toEvent = (row: AgentEventEntity, agentId: string, customerId: string): AgentEventRecord => ({
	id: row.id,
	agentId,
	customerId,
	type: row.type as AgentEventType,
	actor: row.actor as AgentActor,
	detail: row.detail ?? {},
	createdAt: row.createdAt,
});

/** A `LIKE` pattern that matches the text anywhere, with `%`, `_` and `\` in the text taken literally. */
const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

const toBinding = (
	row: PaymentAddressBindingEntity,
	agentId: string,
	customerId: string
): PaymentAddressBindingWithStatus => ({
	id: row.id,
	agentId,
	customerId,
	account: row.account,
	issuedCredentialId: row.issuedCredential?.issuedCredentialId ?? null,
	statusListId: row.statusList?.registryId ?? null,
	statusIndex: row.statusIndex ?? null,
	revokedAt: row.revokedAt ?? null,
	createdAt: row.createdAt,
	issuerDid: row.statusList?.identifier?.did ?? null,
	statusListUri: row.statusList?.uri ?? null,
});

/** The TypeORM implementation. Repositories are looked up per call so importing this file needs no database. */
export class TypeormAgentStore implements AgentStore {
	private get db() {
		return Connection.instance.dbConnection;
	}

	async countOwnedDids(customerId: string, did: string): Promise<number> {
		need(customerId, did);
		return this.db.getRepository(IdentifierEntity).count({ where: { did, customer: { customerId } } });
	}

	async countAgents(customerId: string, agentId: string): Promise<number> {
		need(customerId, agentId);
		return this.db.getRepository(AgentEntity).count({ where: { agentId, customer: { customerId } } });
	}

	async createAgent(agent: NewAgent): Promise<AgentRecord> {
		need(agent.customerId, agent.did);
		const repository = this.db.getRepository(AgentEntity);
		const saved = await repository.save(
			repository.create({
				customer: { customerId: agent.customerId } as CustomerEntity,
				identifier: { did: agent.did } as never,
				name: agent.name,
				description: agent.description,
				actsForDid: agent.actsForDid,
				capabilities: agent.capabilities ?? defaultCapabilities(),
				useCase: agent.useCase,
				status: 'active',
			})
		);
		// Registering an agent creates its DID too. Idempotent and never throws (#869).
		await recordActivation(agent.customerId, 'first_did_created');
		await recordActivation(agent.customerId, 'first_agent_registered');
		return toAgent({ ...saved, identifier: { did: agent.did } } as never, agent.customerId);
	}

	async getAgent(customerId: string, agentId: string): Promise<AgentRecord | null> {
		need(customerId, agentId);
		const row = await this.db.getRepository(AgentEntity).findOne({
			where: { agentId, customer: { customerId } },
			relations: { identifier: true },
		});
		return row ? toAgent(row, customerId) : null;
	}

	async listAgents(customerId: string, page: { limit: number; offset: number; q?: string }) {
		need(customerId);
		const text = page.q?.trim();
		// The filter is part of the query, so `total` and the page both reflect it. Three alternatives, each
		// still carrying the customer: an OR must never widen the tenant scope.
		const where = text
			? (() => {
					const pattern = containsPattern(text);
					return [
						{ customer: { customerId }, name: ILike(pattern) },
						{ customer: { customerId }, description: ILike(pattern) },
						{ customer: { customerId }, identifier: { did: ILike(pattern) } },
					];
				})()
			: { customer: { customerId } };
		const [rows, total] = await this.db.getRepository(AgentEntity).findAndCount({
			where,
			relations: { identifier: true },
			order: { createdAt: 'DESC' },
			take: page.limit,
			skip: page.offset,
		});
		return { items: rows.map((row) => toAgent(row, customerId)), total };
	}

	async updateAgent(customerId: string, agentId: string, patch: AgentPatch): Promise<AgentRecord | null> {
		need(customerId, agentId);
		const repository = this.db.getRepository(AgentEntity);
		const result = await repository.update({ agentId, customer: { customerId } }, patch as never);
		if (!result.affected) return null;
		return this.getAgent(customerId, agentId);
	}

	async softDeleteAgent(customerId: string, agentId: string): Promise<boolean> {
		need(customerId, agentId);
		const repository = this.db.getRepository(AgentEntity);
		const updated = await repository.update({ agentId, customer: { customerId } }, { status: 'deleted' });
		if (!updated.affected) return false;
		const deleted = await repository.softDelete({ agentId, customer: { customerId } });
		return (deleted.affected ?? 0) > 0;
	}

	async latestCardVersion(customerId: string, agentId: string): Promise<number> {
		need(customerId, agentId);
		const latest = await this.db.getRepository(AgentCardEntity).findOne({
			where: { agent: { agentId }, customer: { customerId } },
			order: { version: 'DESC' },
		});
		return latest?.version ?? 0;
	}

	async createCard(card: NewAgentCard): Promise<AgentCardRecord> {
		need(card.customerId, card.agentId);
		const repository = this.db.getRepository(AgentCardEntity);
		const saved = await repository.save(
			repository.create({
				agent: { agentId: card.agentId } as AgentEntity,
				customer: { customerId: card.customerId } as CustomerEntity,
				version: card.version,
				card: card.card,
				jws: card.jws,
				resourceId: card.resourceId,
				publishedAt: card.publishedAt,
			})
		);
		return toCard(saved, card.agentId, card.customerId);
	}

	async getCard(customerId: string, agentId: string, version?: number): Promise<AgentCardRecord | null> {
		need(customerId, agentId);
		const row = await this.db.getRepository(AgentCardEntity).findOne({
			where: { agent: { agentId }, customer: { customerId }, ...(version !== undefined ? { version } : {}) },
			order: { version: 'DESC' },
		});
		return row ? toCard(row, agentId, customerId) : null;
	}

	async latestPublishedCard(customerId: string, agentId: string): Promise<AgentCardRecord | null> {
		need(customerId, agentId);
		const row = await this.db.getRepository(AgentCardEntity).findOne({
			where: { agent: { agentId }, customer: { customerId }, resourceId: Not(IsNull()) },
			order: { version: 'DESC' },
		});
		return row ? toCard(row, agentId, customerId) : null;
	}

	async countGrants(customerId: string, agentId: string, grantId: string): Promise<number> {
		need(customerId, agentId, grantId);
		return this.db
			.getRepository(AuthorityGrantEntity)
			.count({ where: { id: grantId, agent: { agentId }, customer: { customerId } } });
	}

	async getGrant(customerId: string, agentId: string, grantId: string): Promise<AuthorityGrantWithStatus | null> {
		need(customerId, agentId, grantId);
		const row = await this.db.getRepository(AuthorityGrantEntity).findOne({
			where: { id: grantId, agent: { agentId }, customer: { customerId } },
			relations: { issuedCredential: true, statusList: { identifier: true } },
		});
		return row ? toGrant(row, agentId, customerId) : null;
	}

	async listLiveGrants(customerId: string, agentId: string): Promise<AuthorityGrantWithStatus[]> {
		need(customerId, agentId);
		const rows = await this.db.getRepository(AuthorityGrantEntity).find({
			where: { agent: { agentId }, customer: { customerId } },
			relations: { issuedCredential: true, statusList: { identifier: true } },
		});
		return rows.filter((row) => !row.revokedAt).map((row) => toGrant(row, agentId, customerId));
	}

	async listGrants(customerId: string, agentId: string): Promise<AuthorityGrantWithStatus[]> {
		need(customerId, agentId);
		const rows = await this.db.getRepository(AuthorityGrantEntity).find({
			where: { agent: { agentId }, customer: { customerId } },
			relations: { statusList: { identifier: true } },
			order: { createdAt: 'DESC', id: 'ASC' },
		});
		return rows.map((row) => toGrant(row, agentId, customerId));
	}

	async listGrantsForAgents(customerId: string, agentIds: string[]): Promise<AuthorityGrantWithStatus[]> {
		need(customerId, ...agentIds);
		if (agentIds.length === 0) return [];
		const rows = await this.db.getRepository(AuthorityGrantEntity).find({
			where: { agent: { agentId: In(agentIds) }, customer: { customerId } },
			relations: { agent: true, statusList: { identifier: true } },
			order: { createdAt: 'DESC', id: 'ASC' },
		});
		return rows.map((row) => toGrant(row, row.agent.agentId, customerId));
	}

	/**
	 * One active-or-suspended acts-for grant per agent, safe against concurrent requests: the agent row is locked
	 * (`FOR UPDATE`) for the rest of the transaction, so two requests for the same agent take turns and the second
	 * sees the first's grant. "Live" is not revoked and not expired, which cannot be a unique index (expiry depends
	 * on the current time), hence the lock. Rows that already break the rule are left alone and only block a new one.
	 */
	private async assertNoLiveActsFor(manager: EntityManager, grant: NewGrant, now: Date): Promise<void> {
		await manager.query(`SELECT "agentId" FROM "agent" WHERE "agentId" = $1 AND "customerId" = $2 FOR UPDATE`, [
			grant.agentId,
			grant.customerId,
		]);
		const existing = await manager.getRepository(AuthorityGrantEntity).find({
			where: {
				agent: { agentId: grant.agentId },
				customer: { customerId: grant.customerId },
				grantType: 'acts-for',
				revokedAt: IsNull(),
			},
		});
		if (existing.some((row) => !row.expiresAt || row.expiresAt > now)) throw actsForExists();
	}

	async createGrant(grant: NewGrant): Promise<AuthorityGrantRecord> {
		need(grant.customerId, grant.agentId);
		return this.db.transaction(async (manager: EntityManager) => {
			const now = new Date();
			if (grant.grantType === 'acts-for') await this.assertNoLiveActsFor(manager, grant, now);
			const credential = new IssuedCredentialEntity(
				'studio',
				grant.format,
				CredentialCategory.CREDENTIAL,
				[grant.vct],
				now,
				{ customerId: grant.customerId } as CustomerEntity,
				{
					issuerId: grant.issuerDid,
					subjectId: grant.subjectDid,
					statusIndex: grant.statusIndex,
					expiresAt: grant.expiresAt,
					credentialStatus: grant.statusUri
						? { status_list: { idx: grant.statusIndex, uri: grant.statusUri } }
						: undefined,
					statusRegistry: grant.statusListId
						? ({ registryId: grant.statusListId } as StatusRegistryEntity)
						: undefined,
					metadata: { agentId: grant.agentId, grantType: grant.grantType },
				}
			);
			credential.engine = 'credo';
			credential.statusFormat = grant.statusListId ? TOKEN_STATUS_LIST : undefined;
			const savedCredential = await manager.getRepository(IssuedCredentialEntity).save(credential);

			const repository = manager.getRepository(AuthorityGrantEntity);
			const saved = await repository.save(
				repository.create({
					agent: { agentId: grant.agentId } as AgentEntity,
					customer: { customerId: grant.customerId } as CustomerEntity,
					grantType: grant.grantType,
					issuedCredential: {
						issuedCredentialId: savedCredential.issuedCredentialId,
					} as IssuedCredentialEntity,
					statusList: grant.statusListId
						? ({ registryId: grant.statusListId } as StatusRegistryEntity)
						: undefined,
					statusIndex: grant.statusIndex,
					expiresAt: grant.expiresAt,
					policySummary: grant.policySummary as unknown as Record<string, unknown> | undefined,
					claims: grant.claims,
				})
			);
			return {
				id: saved.id,
				agentId: grant.agentId,
				customerId: grant.customerId,
				grantType: saved.grantType,
				issuedCredentialId: savedCredential.issuedCredentialId,
				statusListId: grant.statusListId ?? null,
				statusIndex: saved.statusIndex ?? null,
				expiresAt: saved.expiresAt ?? null,
				revokedAt: null,
				policySummary: grant.policySummary ?? null,
				claims: grant.claims ?? null,
				createdAt: saved.createdAt,
			};
		});
	}

	async countBindings(customerId: string, agentId: string, bindingId: string): Promise<number> {
		need(customerId, agentId, bindingId);
		return this.db
			.getRepository(PaymentAddressBindingEntity)
			.count({ where: { id: bindingId, agent: { agentId }, customer: { customerId } } });
	}

	async getBinding(
		customerId: string,
		agentId: string,
		bindingId: string
	): Promise<PaymentAddressBindingWithStatus | null> {
		need(customerId, agentId, bindingId);
		const row = await this.db.getRepository(PaymentAddressBindingEntity).findOne({
			where: { id: bindingId, agent: { agentId }, customer: { customerId } },
			relations: { issuedCredential: true, statusList: { identifier: true } },
		});
		return row ? toBinding(row, agentId, customerId) : null;
	}

	async listBindings(customerId: string, agentId: string): Promise<PaymentAddressBindingRecord[]> {
		need(customerId, agentId);
		const rows = await this.db.getRepository(PaymentAddressBindingEntity).find({
			where: { agent: { agentId }, customer: { customerId } },
			order: { createdAt: 'DESC', id: 'ASC' },
		});
		return rows.map((row) => ({
			id: row.id,
			agentId,
			customerId,
			account: row.account,
			revokedAt: row.revokedAt ?? null,
			createdAt: row.createdAt,
		}));
	}

	async listLiveBindings(customerId: string, agentId: string): Promise<PaymentAddressBindingWithStatus[]> {
		need(customerId, agentId);
		const rows = await this.db.getRepository(PaymentAddressBindingEntity).find({
			where: { agent: { agentId }, customer: { customerId } },
			relations: { issuedCredential: true, statusList: { identifier: true } },
			order: { createdAt: 'DESC', id: 'ASC' },
		});
		return rows.filter((row) => !row.revokedAt).map((row) => toBinding(row, agentId, customerId));
	}

	async createBinding(binding: NewPaymentAddressBinding): Promise<PaymentAddressBindingRecord> {
		need(binding.customerId, binding.agentId, binding.account);
		try {
			return await this.db.transaction(async (manager: EntityManager) => {
				const credential = new IssuedCredentialEntity(
					'studio',
					'sd-jwt-vc',
					CredentialCategory.CREDENTIAL,
					[VCT.paymentAddressBinding],
					new Date(),
					{ customerId: binding.customerId } as CustomerEntity,
					{
						issuerId: binding.issuerDid,
						subjectId: binding.subjectDid,
						statusIndex: binding.statusIndex,
						credentialStatus: { status_list: { idx: binding.statusIndex, uri: binding.statusUri } },
						statusRegistry: { registryId: binding.statusListId } as StatusRegistryEntity,
						// Metadata only: the signed credential is returned once and never stored.
						metadata: { agentId: binding.agentId, kind: 'payment-address-binding' },
					}
				);
				credential.engine = 'credo';
				credential.statusFormat = TOKEN_STATUS_LIST;
				const savedCredential = await manager.getRepository(IssuedCredentialEntity).save(credential);

				const repository = manager.getRepository(PaymentAddressBindingEntity);
				const saved = await repository.save(
					repository.create({
						agent: { agentId: binding.agentId } as AgentEntity,
						customer: { customerId: binding.customerId } as CustomerEntity,
						account: binding.account,
						issuedCredential: {
							issuedCredentialId: savedCredential.issuedCredentialId,
						} as IssuedCredentialEntity,
						statusList: { registryId: binding.statusListId } as StatusRegistryEntity,
						statusIndex: binding.statusIndex,
					})
				);
				return {
					id: saved.id,
					agentId: binding.agentId,
					customerId: binding.customerId,
					account: saved.account,
					issuedCredentialId: savedCredential.issuedCredentialId,
					statusListId: binding.statusListId,
					statusIndex: saved.statusIndex ?? null,
					revokedAt: null,
					createdAt: saved.createdAt,
				};
			});
		} catch (error) {
			if ((error as { code?: string } | null)?.code === '23505') {
				throw conflict('This payment address is already bound to the agent');
			}
			throw error;
		}
	}

	async markBindingRevoked(
		customerId: string,
		agentId: string,
		bindingId: string
	): Promise<PaymentAddressBindingWithStatus | null> {
		need(customerId, agentId, bindingId);
		const binding = await this.getBinding(customerId, agentId, bindingId);
		if (!binding) return null;
		if (binding.revokedAt) return binding;
		const revokedAt = new Date();
		await this.db.transaction(async (manager: EntityManager) => {
			await manager
				.getRepository(PaymentAddressBindingEntity)
				.update({ id: bindingId, agent: { agentId }, customer: { customerId } }, { revokedAt });
			if (binding.issuedCredentialId) {
				await manager
					.getRepository(IssuedCredentialEntity)
					.update(
						{ issuedCredentialId: binding.issuedCredentialId, customer: { customerId } },
						{ status: 'revoked', statusUpdatedAt: revokedAt }
					);
			}
		});
		return { ...binding, revokedAt };
	}

	async markGrantRevoked(
		customerId: string,
		agentId: string,
		grantId: string
	): Promise<AuthorityGrantWithStatus | null> {
		need(customerId, agentId, grantId);
		const grant = await this.getGrant(customerId, agentId, grantId);
		if (!grant) return null;
		if (grant.revokedAt) return grant;
		const revokedAt = new Date();
		await this.db.transaction(async (manager: EntityManager) => {
			await manager
				.getRepository(AuthorityGrantEntity)
				.update({ id: grantId, agent: { agentId }, customer: { customerId } }, { revokedAt });
			if (grant.issuedCredentialId) {
				await manager
					.getRepository(IssuedCredentialEntity)
					.update(
						{ issuedCredentialId: grant.issuedCredentialId, customer: { customerId } },
						{ status: 'revoked', statusUpdatedAt: revokedAt }
					);
			}
		});
		return { ...grant, revokedAt };
	}

	async replaceGrantCredential(
		customerId: string,
		agentId: string,
		grantId: string,
		replacement: GrantReplacement
	): Promise<AuthorityGrantWithStatus | null> {
		need(customerId, agentId, grantId);
		const grant = await this.getGrant(customerId, agentId, grantId);
		if (!grant) return null;
		await this.db.transaction(async (manager: EntityManager) => {
			const now = new Date();
			const credential = new IssuedCredentialEntity(
				'studio',
				replacement.format,
				CredentialCategory.CREDENTIAL,
				[replacement.vct],
				now,
				{ customerId } as CustomerEntity,
				{
					issuerId: replacement.issuerDid,
					subjectId: replacement.subjectDid,
					statusIndex: replacement.statusIndex,
					expiresAt: replacement.expiresAt,
					credentialStatus: { status_list: { idx: replacement.statusIndex, uri: replacement.statusUri } },
					statusRegistry: { registryId: replacement.statusListId } as StatusRegistryEntity,
					metadata: { agentId, grantType: grant.grantType, replaces: grant.issuedCredentialId ?? undefined },
				}
			);
			credential.engine = 'credo';
			credential.statusFormat = TOKEN_STATUS_LIST;
			const saved = await manager.getRepository(IssuedCredentialEntity).save(credential);
			await manager.getRepository(AuthorityGrantEntity).update(
				{ id: grantId, agent: { agentId }, customer: { customerId } },
				{
					issuedCredential: { issuedCredentialId: saved.issuedCredentialId } as IssuedCredentialEntity,
					statusList: { registryId: replacement.statusListId } as StatusRegistryEntity,
					statusIndex: replacement.statusIndex,
					expiresAt: replacement.expiresAt,
				}
			);
			if (grant.issuedCredentialId) {
				await manager
					.getRepository(IssuedCredentialEntity)
					.update(
						{ issuedCredentialId: grant.issuedCredentialId, customer: { customerId } },
						{ status: 'revoked', statusUpdatedAt: now }
					);
			}
		});
		return this.getGrant(customerId, agentId, grantId);
	}

	async addEvent(event: NewAgentEvent): Promise<AgentEventRecord> {
		need(event.customerId, event.agentId);
		const repository = this.db.getRepository(AgentEventEntity);
		const saved = await repository.save(
			repository.create({
				agent: { agentId: event.agentId } as AgentEntity,
				customer: { customerId: event.customerId } as CustomerEntity,
				type: event.type,
				actor: event.actor,
				detail: event.detail ?? {},
			})
		);
		return toEvent(saved, event.agentId, event.customerId);
	}

	async recordAudit(entry: NewAuditEntry): Promise<void> {
		need(entry.customerId, entry.actor, entry.action);
		await this.db.getRepository(AdminAuditLogEntity).insert({
			actorUserId: entry.actor,
			action: entry.action,
			targetCustomerId: entry.customerId,
			reason: entry.reason,
			metadata: entry.metadata as never,
		});
	}

	async listEvents(
		customerId: string,
		agentId: string,
		page: { limit: number; offset: number; types?: AgentEventType[] }
	) {
		need(customerId, agentId);
		const [rows, total] = await this.db.getRepository(AgentEventEntity).findAndCount({
			where: {
				agent: { agentId },
				customer: { customerId },
				...(page.types ? { type: In(page.types) } : {}),
			},
			order: { createdAt: 'DESC', id: 'ASC' },
			take: page.limit,
			skip: page.offset,
		});
		return { items: rows.map((row) => toEvent(row, agentId, customerId)), total };
	}

	async findOpenStatusList(customerId: string, issuerDid: string): Promise<TokenStatusListRecord | null> {
		need(customerId, issuerDid);
		const rows = await this.db.getRepository(StatusRegistryEntity).find({
			where: {
				customer: { customerId },
				identifier: { did: issuerDid },
				registryType: TOKEN_STATUS_LIST,
				state: StatusRegistryState.Active,
				deprecated: false,
			},
			relations: { identifier: true },
			order: { createdAt: 'DESC' },
		});
		const open = rows.find((row) => row.writeCursor < row.registrySize);
		return open
			? {
					registryId: open.registryId,
					uri: open.uri,
					issuerDid,
					name: open.registryName,
					size: open.registrySize,
					writeCursor: open.writeCursor,
				}
			: null;
	}

	async createStatusList(list: NewStatusList): Promise<TokenStatusListRecord> {
		need(list.customerId, list.issuerDid);
		const repository = this.db.getRepository(StatusRegistryEntity);
		const entity = new StatusRegistryEntity({
			uri: list.uri,
			registryType: TOKEN_STATUS_LIST,
			registryName: list.name,
			credentialCategory: CredentialCategory.CREDENTIAL,
			version: 0,
			registrySize: list.size,
			writeCursor: 0,
			state: StatusRegistryState.Active,
			storageType: 'cheqd',
			identifier: { did: list.issuerDid } as never,
			customer: { customerId: list.customerId } as CustomerEntity,
		});
		entity.engine = 'credo';
		entity.listFormat = TOKEN_STATUS_LIST;
		const saved = await repository.save(entity);
		await recordActivation(list.customerId, 'first_status_list_created');
		return {
			registryId: saved.registryId,
			uri: list.uri,
			issuerDid: list.issuerDid,
			name: list.name,
			size: list.size,
			writeCursor: 0,
		};
	}

	/**
	 * Compare-and-swap on `version`: the update only matches while nobody else has taken an index since the read.
	 * `writeCursor` here is the number of indexes handed out, so the index returned is the cursor before the bump.
	 */
	async reserveStatusIndex(customerId: string, registryId: string): Promise<number | null> {
		need(customerId, registryId);
		const repository = this.db.getRepository(StatusRegistryEntity);
		for (let attempt = 0; attempt < 8; attempt++) {
			const row = await repository.findOne({ where: { registryId, customer: { customerId } } });
			if (!row || row.writeCursor >= row.registrySize) return null;
			const result = await repository.update(
				{ registryId, customer: { customerId }, version: row.version },
				{
					writeCursor: row.writeCursor + 1,
					version: row.version + 1,
					...(row.writeCursor + 1 >= row.registrySize ? { state: StatusRegistryState.Full } : {}),
				}
			);
			if (result.affected === 1) return row.writeCursor;
		}
		throw new Error('Could not reserve a status list index: too much contention');
	}
}
