import { statusUpdateConflict, statusUpdateFailure } from './status-update-outcome.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { NOT_FOUND_MESSAGE, OwnershipError } from '../identity/ownership-error.js';
import type { SafeAPIResponse } from '../../types/common.js';
import {
	AccreditationSchemaType,
	AccreditationRequestType,
	DIDAccreditationTypes,
	DIDAccreditationPolicyTypes,
} from '../../types/accreditation.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import { statusListArtifactFromCredential } from '../identity/engine/artifact-refs.js';
import {
	buildCacheKey,
	getCachedAccreditation,
	inFlightAccreditations,
	setCachedAccreditation,
} from '../identity/engine/accreditation-cache.js';
import { engineRouter } from '../identity/engine/db-lookups.js';
import type { EngineAccreditationVerifyRequest } from '../identity/engine/types.js';
import type { IVerifyResult, VerificationPolicies, VerifiableCredential } from '@veramo/core';
import { CheqdW3CVerifiableCredential } from '../w3c-credential.js';
import { StatusCodes } from 'http-status-codes';
import { v4 } from 'uuid';
import { CredentialCategory, CredentialConnectors } from '../../types/credential.js';
import type { CredentialRequest } from '../../types/credential.js';
import { Credentials } from './credentials.js';
import { BitstringUpdateResult, RevocationResult } from '@cheqd/did-provider-cheqd';
import { StatusListType } from '../../types/credential-status.js';
import { isEngineError } from '../../helpers/engine-errors.js';

const ACCREDITATION_RESOLVE_CONCURRENCY = 8;

/**
 * The failure answer for an unexpected error. A typed engine error (not implemented, not found, ledger busy, ...) is
 * rethrown instead, so the controller's `engineErrorResponse` answers with its own status, code and `Retry-After`
 * rather than a generic 500.
 */
function internalErrorUnlessEngineError(error: unknown): { success: false; status: number; error: string } {
	if (isEngineError(error)) throw error;
	return {
		success: false,
		status: StatusCodes.INTERNAL_SERVER_ERROR,
		error: `Internal error: ${(error as Error)?.message || error}`,
	};
}

export class AccreditationService {
	public static instance = new AccreditationService();

	async issue_accreditation(
		accreditationType: AccreditationRequestType,
		issuerDid: string,
		subjectDid: string,
		schemas: { url: string; types: string | string[] }[],
		body: any,
		customer: CustomerEntity
	): Promise<SafeAPIResponse<{ didUrls: string[]; accreditation: VerifiableCredential }>> {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		// Handles string input instead of an array
		let {
			type,
			'@context': context,
			parentAccreditation,
			rootAuthorization,
			trustFramework,
			trustFrameworkId,
			attributes,
			accreditationName,
			format,
			credentialStatus,
		} = body;
		if (typeof type === 'string') {
			type = [type];
		}
		if (typeof context === 'string') {
			context = [context];
		}

		try {
			// Validate issuer and subject DIDs in parallel only for authorize
			// For attest, accredit they are validated in verify_accreditation
			const [issuerDidRes, subjectDidRes] = await Promise.all([
				identityServiceStrategySetup.agent.resolveDid(issuerDid),
				identityServiceStrategySetup.agent.resolveDid(subjectDid),
			]);

			// Validate issuer DID
			if (!issuerDidRes?.didDocument) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					error: `DID ${issuerDid} is not resolved because of error from resolver: ${issuerDidRes.didResolutionMetadata.error}.`,
				};
			}
			if (issuerDidRes.didDocumentMetadata.deactivated) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					error: `${issuerDid} is deactivated`,
				};
			}

			// Validate subject DID
			if (!subjectDidRes?.didDocument) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					error: `DID ${subjectDid} is not resolved because of error from resolver: ${subjectDidRes.didResolutionMetadata.error}.`,
				};
			}
			if (subjectDidRes.didDocumentMetadata.deactivated) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					error: `${subjectDid} is deactivated`,
				};
			}

			const resourceId = v4();
			const accreditedFor = schemas.map(({ url, types }: { url: string; types: string | string[] }) => ({
				schemaId: url,
				types: Array.isArray(types) ? types : [types],
			}));

			// construct credential request
			const credentialRequest: CredentialRequest = {
				subjectDid,
				attributes: {
					...attributes,
					accreditedFor,
					id: subjectDid,
				},
				issuerDid,
				format: format || 'jwt',
				connector: CredentialConnectors.Resource,
				credentialId: resourceId,
				credentialName: accreditationName,
				credentialStatus,
				category: CredentialCategory.ACCREDITATION,
			};

			let resourceType: string;
			switch (accreditationType) {
				case AccreditationRequestType.authorize:
					resourceType = DIDAccreditationTypes.VerifiableAuthorizationForTrustChain;
					credentialRequest.type = [...(type || []), resourceType];
					credentialRequest.termsOfUse = {
						type: DIDAccreditationPolicyTypes.Authorize,
						trustFramework,
						trustFrameworkId,
					};
					break;
				case AccreditationRequestType.accredit:
					resourceType = DIDAccreditationTypes.VerifiableAccreditationToAccredit;
					credentialRequest.type = [...(type || []), resourceType];
					credentialRequest.termsOfUse = {
						type: DIDAccreditationPolicyTypes.Accredit,
						parentAccreditation,
						rootAuthorization,
					};
					break;
				case AccreditationRequestType.attest:
					resourceType = DIDAccreditationTypes.VerifiableAccreditationToAttest;
					credentialRequest.type = [...(type || []), resourceType];
					credentialRequest.termsOfUse = {
						type: DIDAccreditationPolicyTypes.Accredit,
						parentAccreditation,
						rootAuthorization,
					};
					break;
			}

			// validate parent and root accreditations
			if (
				accreditationType === AccreditationRequestType.accredit ||
				accreditationType === AccreditationRequestType.attest
			) {
				const result = await this.verify_accreditation(
					issuerDid,
					parentAccreditation!,
					accreditedFor,
					true,
					false,
					customer,
					rootAuthorization
				);

				if (result.success === false) {
					return {
						success: false,
						// A chain that verifies as invalid comes back as a 200 verification result; issuing on it is
						// the caller's error, so it must not reach the client as a success status
						status: result.status >= StatusCodes.BAD_REQUEST ? result.status : StatusCodes.BAD_REQUEST,
						error: `Invalid Request: Root Authorization or parent Accreditation is not valid: ${result.error}`,
					};
				}
			}

			// issue accreditation
			const accreditation: VerifiableCredential = await Credentials.instance.issue_credential(
				credentialRequest,
				customer
			);

			return {
				success: true,
				status: StatusCodes.OK,
				data: {
					didUrls: [
						`${issuerDid}/resources/${resourceId}`,
						`${issuerDid}?resourceName=${encodeURIComponent(accreditationName)}&resourceType=${resourceType}`,
					],
					accreditation,
				},
			};
		} catch (error) {
			if (error instanceof OwnershipError) {
				return { success: false, status: StatusCodes.NOT_FOUND, error: NOT_FOUND_MESSAGE };
			}
			return internalErrorUnlessEngineError(error);
		}
	}

	async revoke_accreditation(
		didUrl: string,
		publish: boolean,
		symmetricKey: string,
		customer: CustomerEntity
	): Promise<SafeAPIResponse<RevocationResult | BitstringUpdateResult>> {
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			const res = await identityServiceStrategySetup.agent.resolve(didUrl);

			const resource = await res.json();

			if (resource.dereferencingMetadata) {
				return {
					success: false,
					status: StatusCodes.NOT_FOUND,
					error: `DID URL ${didUrl} is not found`,
				};
			}

			const accreditation: CheqdW3CVerifiableCredential = resource;

			const engine = await identityServiceStrategySetup.routed(
				'status-list',
				await statusListArtifactFromCredential(accreditation, customer.customerId)
			);
			// A change that would do nothing is refused with 409 before anything is written
			const noOp = await statusUpdateConflict(
				'revoke',
				accreditation,
				StatusListType.Bitstring,
				engine,
				customer,
				symmetricKey
			);
			if (noOp) return { success: false, status: noOp.statusCode, error: noOp.error, data: { code: noOp.code } };
			const result = await engine.revokeCredentials(
				accreditation,
				StatusListType.Bitstring,
				publish,
				customer,
				symmetricKey
			);

			const failure = statusUpdateFailure('revoke', result as Record<string, unknown>);
			if (failure)
				return {
					success: false,
					status: failure.statusCode,
					error: failure.error,
					data: { code: failure.code },
				};
			await Credentials.instance.recordStatusChange(accreditation, 'revoke', customer);

			return {
				success: true,
				status: StatusCodes.OK,
				data: result as RevocationResult | BitstringUpdateResult,
			};
		} catch (error) {
			if (error instanceof OwnershipError) {
				return { success: false, status: StatusCodes.NOT_FOUND, error: NOT_FOUND_MESSAGE };
			}
			return internalErrorUnlessEngineError(error);
		}
	}

	async suspend_accreditation(
		didUrl: string,
		publish: boolean,
		symmetricKey: string,
		customer: CustomerEntity
	): Promise<SafeAPIResponse<BitstringUpdateResult>> {
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			const res = await identityServiceStrategySetup.agent.resolve(didUrl);

			const resource = await res.json();

			if (resource.dereferencingMetadata) {
				return {
					success: false,
					status: StatusCodes.NOT_FOUND,
					error: `DID URL ${didUrl} is not found`,
				};
			}

			const accreditation: CheqdW3CVerifiableCredential = resource;

			const engine = await identityServiceStrategySetup.routed(
				'status-list',
				await statusListArtifactFromCredential(accreditation, customer.customerId)
			);
			// A change that would do nothing is refused with 409 before anything is written
			const noOp = await statusUpdateConflict(
				'suspend',
				accreditation,
				StatusListType.Bitstring,
				engine,
				customer,
				symmetricKey
			);
			if (noOp) return { success: false, status: noOp.statusCode, error: noOp.error, data: { code: noOp.code } };
			const result = await engine.suspendCredentials(
				accreditation,
				StatusListType.Bitstring,
				publish,
				customer,
				symmetricKey
			);

			const failure = statusUpdateFailure('suspend', result as Record<string, unknown>);
			if (failure)
				return {
					success: false,
					status: failure.statusCode,
					error: failure.error,
					data: { code: failure.code },
				};
			await Credentials.instance.recordStatusChange(accreditation, 'suspend', customer);

			return {
				success: true,
				status: StatusCodes.OK,
				data: result as BitstringUpdateResult,
			};
		} catch (error) {
			if (error instanceof OwnershipError) {
				return { success: false, status: StatusCodes.NOT_FOUND, error: NOT_FOUND_MESSAGE };
			}
			return internalErrorUnlessEngineError(error);
		}
	}

	async reinstate_accreditation(
		didUrl: string,
		publish: boolean,
		symmetricKey: string,
		customer: CustomerEntity
	): Promise<SafeAPIResponse<BitstringUpdateResult>> {
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			const res = await identityServiceStrategySetup.agent.resolve(didUrl);

			const resource = await res.json();

			if (resource.dereferencingMetadata) {
				return {
					success: false,
					status: StatusCodes.NOT_FOUND,
					error: `DID URL ${didUrl} is not found`,
				};
			}

			const accreditation: CheqdW3CVerifiableCredential = resource;

			const engine = await identityServiceStrategySetup.routed(
				'status-list',
				await statusListArtifactFromCredential(accreditation, customer.customerId)
			);
			// A change that would do nothing is refused with 409 before anything is written
			const noOp = await statusUpdateConflict(
				'reinstate',
				accreditation,
				StatusListType.Bitstring,
				engine,
				customer,
				symmetricKey
			);
			if (noOp) return { success: false, status: noOp.statusCode, error: noOp.error, data: { code: noOp.code } };
			const result = await engine.reinstateCredentials(
				accreditation,
				StatusListType.Bitstring,
				publish,
				customer,
				symmetricKey
			);

			const failure = statusUpdateFailure('reinstate', result as Record<string, unknown>);
			if (failure)
				return {
					success: false,
					status: failure.statusCode,
					error: failure.error,
					data: { code: failure.code },
				};
			await Credentials.instance.recordStatusChange(accreditation, 'reinstate', customer);

			return {
				success: true,
				status: StatusCodes.OK,
				data: result as BitstringUpdateResult,
			};
		} catch (error) {
			if (error instanceof OwnershipError) {
				return { success: false, status: StatusCodes.NOT_FOUND, error: NOT_FOUND_MESSAGE };
			}
			return internalErrorUnlessEngineError(error);
		}
	}

	async verify_accreditation(
		subjectDid: string,
		didUrl: string,
		accreditedFor: AccreditationSchemaType[] = [],
		verifyStatus: boolean,
		allowDeactivatedDid: boolean,
		customer: CustomerEntity,
		rootAuthorization?: string,
		policies?: VerificationPolicies
	): Promise<
		SafeAPIResponse<IVerifyResult & { accreditorDids: string[]; rootAuthorization: string; termsOfUse?: any }>
	> {
		// Verifying needs no customer key or payment account, so the Veramo service stays the one it always was (not the
		// customer's, which cannot be built without a payment account). The customer id only informs the engine choice.
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();
		const engine = await engineRouter.engineFor(
			{ customerId: customer?.customerId, route: 'credential' },
			identityServiceStrategySetup.agent
		);
		const request: EngineAccreditationVerifyRequest = {
			subjectDid,
			didUrl,
			accreditedFor,
			verifyStatus,
			allowDeactivatedDid,
			rootAuthorization,
			policies: policies as EngineAccreditationVerifyRequest['policies'],
		};
		return (await engine.verifyAccreditation(request, customer)) as SafeAPIResponse<
			IVerifyResult & { accreditorDids: string[]; rootAuthorization: string; termsOfUse?: any }
		>;
	}

	async list_accreditations(
		customer: CustomerEntity,
		accreditationType: AccreditationRequestType,
		network?: string,
		did?: string,
		page?: number,
		limit?: number
	): Promise<SafeAPIResponse<{ total: number; accreditations: any[] }>> {
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		let resourceType: string;
		switch (accreditationType) {
			case AccreditationRequestType.authorize:
				resourceType = DIDAccreditationTypes.VerifiableAuthorizationForTrustChain;
				break;
			case AccreditationRequestType.accredit:
				resourceType = DIDAccreditationTypes.VerifiableAccreditationToAccredit;
				break;
			case AccreditationRequestType.attest:
				resourceType = DIDAccreditationTypes.VerifiableAccreditationToAttest;
				break;
			default:
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					error: `Invalid accreditationType: ${accreditationType}. Must be one of: authorize, accredit, attest.`,
				};
		}

		try {
			// Fetch resources of accreditation resourceType associated with the account
			// Same family as listing resources: the table is Studio's, and the DID filter names an existing artifact
			const engine = await identityServiceStrategySetup.engine(
				'resource',
				did ? { kind: 'did', id: did } : undefined
			);
			const { resources } = await engine.findLatestResourcesVersionsByType(
				resourceType,
				customer,
				network,
				did,
				page,
				limit
			);

			// Build resource URLs for resolution
			const resourceUrls = resources.map((item) => `${item.did}/resources/${item.resourceId}`);

			// No resources to resolve, return early
			if (resourceUrls.length === 0) {
				return {
					success: true,
					status: StatusCodes.OK,
					data: {
						total: 0,
						accreditations: [],
					},
				};
			}

			// 1. Fetch all tracking records from the issued credentials table
			const { credentials: trackingRecords } = await Credentials.instance.list(customer, {
				category: CredentialCategory.ACCREDITATION,
				providerCredentialId: resources.map((item) => item.resourceId),
			});

			// 2. OPTIMIZATION: Create a Map for O(1) tracking record lookup by providerCredentialId
			const trackingMap = new Map();
			for (const record of trackingRecords) {
				trackingMap.set(record.providerCredentialId, record);
			}

			const resolveAccreditationWithCache = async (url: string) => {
				const cacheKey = buildCacheKey(url, customer?.customerId);
				const cached = getCachedAccreditation(cacheKey);
				if (cached) {
					return cached;
				}
				const inFlight = inFlightAccreditations.get(cacheKey);
				if (inFlight) {
					return inFlight;
				}
				const resolverPromise = (async () => {
					try {
						const res = await engine.resolve(url, true);
						const credential = await res.json();

						// Skip if the credential doesn't have contentStream
						if (!credential.contentStream) {
							return null;
						}

						const resourceId = credential.contentMetadata.resourceId;

						const trackingRecord = trackingMap.get(resourceId);

						if (trackingRecord) {
							const { issuedCredentialId, providerId, providerCredentialId, status, statusUpdatedAt } =
								trackingRecord;

							// Merge tracking metadata with credential
							const accreditation = {
								...credential.contentStream,
								metadata: {
									issuedCredentialId,
									providerId,
									providerCredentialId,
									status,
									statusUpdatedAt,
								},
							};
							setCachedAccreditation(cacheKey, accreditation);
							return accreditation;
						} else {
							// No tracking record, return just the credential (legacy)
							setCachedAccreditation(cacheKey, credential.contentStream);
							return credential.contentStream;
						}
					} catch (error) {
						console.error(`Failed to process accreditation for URL: ${url}`, error);
						return null;
					} finally {
						inFlightAccreditations.delete(cacheKey);
					}
				})();

				inFlightAccreditations.set(cacheKey, resolverPromise);
				return resolverPromise;
			};

			// 3. Resolve resources and enhance with tracking metadata with bounded concurrency
			const resolvedAccreditations: Array<ReturnType<typeof resolveAccreditationWithCache>> = new Array(
				resourceUrls.length
			);
			let currentIndex = 0;

			const workers = Array.from(
				{ length: Math.min(ACCREDITATION_RESOLVE_CONCURRENCY, resourceUrls.length) },
				async () => {
					// eslint-disable-next-line no-constant-condition
					while (true) {
						const index = currentIndex++;
						if (index >= resourceUrls.length) {
							break;
						}
						const accreditation = await resolveAccreditationWithCache(resourceUrls[index]);
						if (accreditation) {
							resolvedAccreditations[index] = accreditation;
						}
					}
				}
			);

			// 4. Wait for all resolutions to complete and filter out any failed/skipped ones (null)
			await Promise.all(workers);
			const accreditations = resolvedAccreditations.filter(Boolean) as NonNullable<
				Awaited<ReturnType<typeof resolveAccreditationWithCache>>
			>[];
			return {
				success: true,
				status: StatusCodes.OK,
				data: {
					total: accreditations.length,
					accreditations: accreditations,
				},
			};
		} catch (error) {
			return internalErrorUnlessEngineError(error);
		}
	}
}
