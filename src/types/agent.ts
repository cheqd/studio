/**
 * Types for the agent endpoints (migration plan, section 8.3): register an agent, give it a card, grant it
 * authority and verify it. These are the REST shapes; the database shapes are in `database/entities`.
 */

export const AGENT_NETWORKS = ['testnet', 'mainnet'] as const;
export type AgentNetwork = (typeof AGENT_NETWORKS)[number];

/** `deleted` is set when an agent is removed; the row stays for the audit trail (soft delete). */
export const AGENT_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
/** The statuses a caller may set with PATCH. */
export const AGENT_SETTABLE_STATUSES = ['active', 'suspended'] as const;

/**
 * What an authority grant is (K25):
 *  - `acts-for`    an SD-JWT VC that says the agent acts for the issuing organisation (real, needs the Credo engine);
 *  - `tool-scope`  an SD-JWT VC listing the tools the agent may call (real, needs the Credo engine);
 *  - `mandate`     an AP2 open mandate as an SD-JWT VC, single hop only (real, needs the Credo engine);
 *  - `delegation`  a KYA-OS delegation credential. GATED behind `ENABLE_KYA_OS_DELEGATIONS`, UNTESTED (gate T9).
 */
export const GRANT_TYPES = ['acts-for', 'tool-scope', 'mandate', 'delegation'] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export const VCT = {
	actsFor: 'https://cheqd.io/vct/agent-acts-for/v1',
	toolScope: 'https://cheqd.io/vct/agent-tool-scope/v1',
	paymentOpenMandate: 'mandate.payment.open.1',
	checkoutOpenMandate: 'mandate.checkout.open.1',
} as const;

export interface AgentRecord {
	agentId: string;
	customerId: string;
	did: string;
	name: string;
	description?: string | null;
	actsForDid?: string | null;
	status: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt?: Date | null;
}

export interface AgentCardRecord {
	id: string;
	agentId: string;
	customerId: string;
	version: number;
	card: Record<string, unknown>;
	jws?: string | null;
	resourceId?: string | null;
	publishedAt?: Date | null;
	createdAt: Date;
}

export interface AuthorityGrantRecord {
	id: string;
	agentId: string;
	customerId: string;
	grantType: string;
	issuedCredentialId?: string | null;
	statusListId?: string | null;
	statusIndex?: number | null;
	expiresAt?: Date | null;
	revokedAt?: Date | null;
	createdAt: Date;
}

/** A grant with what revoking it needs: the issuer DID and the status list URI behind `statusListId`. */
export interface AuthorityGrantWithStatus extends AuthorityGrantRecord {
	issuerDid?: string | null;
	statusListUri?: string | null;
}

export interface TokenStatusListRecord {
	registryId: string;
	uri: string;
	issuerDid: string;
	name: string;
	size: number;
	/** Number of indexes handed out so far, which is also the next free index. */
	writeCursor: number;
}
