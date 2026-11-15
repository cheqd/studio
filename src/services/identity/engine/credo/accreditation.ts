/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import type { ListResourceResponse } from '../../../../types/resource.js';
import { walkAccreditationChain, type AccreditationChainPorts } from '../accreditation-chain.js';
import type {
	EngineAccreditationOutcome,
	EngineAccreditationVerifyRequest,
	EngineDidResolution,
	EngineSignedInput,
	EngineVerificationOptions,
	EngineVerificationResult,
} from '../types.js';
import type { CredoEngineStore } from './ports.js';

/**
 * Trust-chain accreditations for the Credo engine (migration plan, Phase 1 step 8).
 *
 * The walk itself is Studio's rule set and is shared with the Veramo engine (`../accreditation-chain.ts`). What is
 * Credo's here is how each link is read and checked:
 *
 * - Resolution: the accreditation is dereferenced by DID URL through the engine's resolver, which returns the linked
 *   resource. A parent link is only followed if it is a DID URL, because it comes from the credential being checked
 *   and is appended to the resolver's address.
 * - Deactivation: each issuer DID is resolved and its `deactivated` metadata read.
 * - Verification: the engine's own `verifyCredential`, which is the two-step check. Credo's default verification
 *   throws for a JWT credential that has a status entry, so the signature, data model and issuer are verified with
 *   `verifyCredentialStatus: false`, and the status entry is then read on its own through the engine's status-list
 *   read. A revoked or suspended entry comes back as `valid: false` with the reason in `message`, which is how the
 *   Veramo path reports it, so both engines word the failure identically. A status that cannot be read stays an error
 *   (it never passes silently).
 * - Limits: the walk stops after `maxChainDepth` links and refuses a chain that returns to a link it has seen.
 *
 * Ownership: the chain is public data on the ledger, so verifying needs no ownership. Listing is scoped to the customer
 * in the query (`findLatestResourcesVersionsByType`), and issuing and status changes check the issuer DID against the
 * customer's rows in `CredoCredentials` and `CredoStatusLists`.
 */

/** Most links a chain may have. Real chains are a few links long (root, accreditor, attestor). */
export const DEFAULT_MAX_CHAIN_DEPTH = 10;

const DID_URL = /^did:[a-z0-9]+:\S+$/i;
const STATUS_FAILURES = new Set(['revoked', 'suspended']);

export interface CredoAccreditationDependencies {
	store: Pick<CredoEngineStore, 'findLatestResourcesVersionsByType'>;
	/** Dereferences a DID URL through the resolver, as the engine's `resolve` does. */
	resolveUrl: (didUrl: string, dereferencing?: boolean) => Promise<Response>;
	resolveDid: (did: string) => Promise<EngineDidResolution>;
	verifyCredential: (
		credential: EngineSignedInput,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	) => Promise<EngineVerificationResult>;
	maxChainDepth?: number;
}

function requireCustomerId(customer: CustomerEntity | undefined): string {
	if (!customer?.customerId) throw new Error('Customer not found');
	return customer.customerId;
}

/** The two-step result in the form the shared walk reads: a revoked or suspended entry is `valid: false`, not an error. */
export function toChainVerification(result: EngineVerificationResult): Record<string, any> {
	const code = result.error?.errorCode;
	if (!result.verified && code && STATUS_FAILURES.has(code)) {
		const { error: _error, ...rest } = result;
		return { ...rest, valid: false, message: code };
	}
	return { ...result };
}

export class CredoAccreditations {
	private readonly maxChainDepth: number;

	constructor(private readonly deps: CredoAccreditationDependencies) {
		this.maxChainDepth = deps.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
	}

	async findLatestResourcesVersionsByType(
		resourceType: string,
		customer: CustomerEntity,
		network?: string,
		did?: string,
		page?: number,
		limit?: number
	): Promise<ListResourceResponse> {
		return this.deps.store.findLatestResourcesVersionsByType(
			requireCustomerId(customer),
			resourceType,
			network,
			did,
			page,
			limit
		);
	}

	async verifyAccreditation(
		request: EngineAccreditationVerifyRequest,
		customer: CustomerEntity
	): Promise<EngineAccreditationOutcome> {
		requireCustomerId(customer);
		return walkAccreditationChain(this.ports(customer), request, {
			maxDepth: this.maxChainDepth,
			detectCycles: true,
		});
	}

	private ports(customer: CustomerEntity): AccreditationChainPorts {
		return {
			resolve: async (didUrl) => {
				// A parent link is read from a credential: only a DID URL is ever sent to the resolver
				if (typeof didUrl !== 'string' || !DID_URL.test(didUrl)) {
					return { dereferencingMetadata: { error: 'invalidDidUrl' } };
				}
				const response = await this.deps.resolveUrl(didUrl);
				const text = await response.text();
				let body: any;
				try {
					body = JSON.parse(text);
				} catch {
					// A resolver that answers with something that is not JSON is unavailable, not "not found"
					throw new Error(
						`The resolver returned an unreadable answer (HTTP ${response.status}) for ${didUrl}`
					);
				}
				if (body === null || typeof body !== 'object') {
					return { dereferencingMetadata: { error: 'notFound' } };
				}
				return body;
			},
			isIssuerDeactivated: async (credential) => {
				const did = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;
				const resolution = await this.deps.resolveDid(did);
				return resolution.didDocumentMetadata?.deactivated === true;
			},
			verifyCredential: async (credential, options) =>
				toChainVerification(
					await this.deps.verifyCredential(
						credential,
						{ verifyStatus: options.verifyStatus, policies: options.policies },
						customer
					)
				),
		};
	}
}
