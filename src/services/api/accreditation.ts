import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { SafeAPIResponse } from '../../types/common.js';
import {
	AccreditationSchemaType,
	AccreditationRequestType,
	DIDAccreditationTypes,
	DIDAccreditationPolicyTypes,
	VerfifiableAccreditation,
} from '../../types/accreditation.js';
import { isCredentialIssuerDidDeactivated } from '../helpers.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import type { IVerifyResult, VerificationPolicies, VerifiableCredential } from '@veramo/core';
import { CheqdW3CVerifiableCredential } from '../w3c-credential.js';
import { StatusCodes } from 'http-status-codes';
import { parseDidFromDidUrl } from '../../helpers/helpers.js';
import { v4 } from 'uuid';
import { CredentialCategory, CredentialConnectors } from '../../types/credential.js';
import type { CredentialRequest } from '../../types/credential.js';
import { Credentials } from './credentials.js';
import NodeCache from 'node-cache';
import { BitstringUpdateResult, RevocationResult } from '@cheqd/did-provider-cheqd';
import { StatusListType } from '../../types/credential-status.js';

const ACCREDITATION_RESOLVE_CACHE_TTL_MS = 30_000;
const ACCREDITATION_RESOLVE_CACHE_MAX_ENTRIES = 200;
const ACCREDITATION_RESOLVE_CONCURRENCY = 8;

function buildCacheKey(url: string, customerId?: string) {
	return `${customerId ?? 'anonymous'}::${url}`;
}

const accreditationResolveCache = new NodeCache({
	stdTTL: ACCREDITATION_RESOLVE_CACHE_TTL_MS / 1000,
	checkperiod: 0,
	useClones: false,
	deleteOnExpire: true,
	maxKeys: ACCREDITATION_RESOLVE_CACHE_MAX_ENTRIES,
});
const inFlightAccreditations = new Map<string, Promise<unknown>>();

function getCachedAccreditation(key: string) {
	return accreditationResolveCache.get(key) ?? null;
}

function setCachedAccreditation(key: string, value: unknown) {
	accreditationResolveCache.set(key, value);
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
						status: result.status,
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
			return {
				success: false,
				status: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Error)?.message || error}`,
			};
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

			const result = await identityServiceStrategySetup.agent.revokeCredentials(
				accreditation,
				StatusListType.Bitstring,
				publish,
				customer,
				symmetricKey
			);

			return {
				success: true,
				status: StatusCodes.OK,
				data: result as RevocationResult | BitstringUpdateResult,
			};
		} catch (error) {
			return {
				success: false,
				status: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Error)?.message || error}`,
			};
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

			const result = await identityServiceStrategySetup.agent.suspendCredentials(
				accreditation,
				StatusListType.Bitstring,
				publish,
				customer,
				symmetricKey
			);

			return {
				success: true,
				status: StatusCodes.OK,
				data: result as BitstringUpdateResult,
			};
		} catch (error) {
			return {
				success: false,
				status: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Error)?.message || error}`,
			};
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

			const result = await identityServiceStrategySetup.agent.reinstateCredentials(
				accreditation,
				StatusListType.Bitstring,
				publish,
				customer,
				symmetricKey
			);

			return {
				success: true,
				status: StatusCodes.OK,
				data: result as BitstringUpdateResult,
			};
		} catch (error) {
			return {
				success: false,
				status: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Error)?.message || error}`,
			};
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
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		let accreditationUrl = didUrl;
		let accreditedSubject = subjectDid;
		let initialVerifyResult: IVerifyResult | undefined = undefined;
		let accreditorDids: string[] = [];

		let deactivatedDidsCheckPromises: Promise<boolean>[] = [];

		while (true) {
			const cacheKey = buildCacheKey(accreditationUrl, customer?.customerId);
			const cached = getCachedAccreditation(cacheKey);
			let result;
			if (cached) {
				result = cached;
			} else {
				const res = await identityServiceStrategySetup.agent.resolve(accreditationUrl);
				result = await res.json();
				// Cache successful dereferenced results (skip caching not-found / dereferencing metadata)
				if (!result?.dereferencingMetadata) {
					setCachedAccreditation(cacheKey, result);
				}
			}

			if (result.dereferencingMetadata) {
				return {
					success: false,
					status: StatusCodes.NOT_FOUND,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: DID URL ${accreditationUrl} is not found`,
				};
			}

			// Create credential object
			const accreditation: VerfifiableAccreditation = result;
			const accreditorDid =
				typeof accreditation.issuer === 'string' ? accreditation.issuer : accreditation.issuer.id;

			// Check if issuer DID is deactivated
			if (!allowDeactivatedDid) {
				deactivatedDidsCheckPromises.push(
					isCredentialIssuerDidDeactivated(accreditation as unknown as CheqdW3CVerifiableCredential)
				);
			}

			// Check if the accreditation is provided for the subjectDid
			if (accreditation.credentialSubject.id !== accreditedSubject) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: Expected accreditation to be linked to subject DID ${accreditedSubject}, but found it linked to DID ${accreditation.credentialSubject.id} instead.`,
				};
			}

			// Check if the accreditor has permission for the schema provided
			if (
				!accreditedFor.every((schema) =>
					accreditation.credentialSubject.accreditedFor.some(
						(accredited) =>
							schema.types.every((value) => (accredited.types || []).includes(value)) &&
							accredited.schemaId === schema.schemaId
					)
				)
			) {
				return {
					success: false,
					status: StatusCodes.UNAUTHORIZED,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: Accreditation does not have the permissions for the given schema`,
				};
			}

			const verifyResult = await identityServiceStrategySetup.agent.verifyCredential(
				accreditation,
				{
					verifyStatus,
					policies,
				},
				customer
			);

			if (!initialVerifyResult) {
				initialVerifyResult = { ...verifyResult, rootAuthorization };
			}

			if (verifyResult.error) {
				return {
					success: false,
					status: StatusCodes.OK,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: ${verifyResult.error.message}`,
				};
			}

			if (verifyStatus && verifyResult.valid === false) {
				return {
					success: false,
					status: StatusCodes.OK,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: ${accreditorDid} is ${verifyResult.message} in the trust chain`,
				};
			}

			if (!Array.isArray(accreditation.type)) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: Invalid accreditation type`,
				};
			}

			const accreditationTypes = Object.keys(DIDAccreditationTypes);
			const isTypeAccreditation = accreditation.type.find((x: any) => accreditationTypes.includes(x));

			if (!isTypeAccreditation) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: Invalid accreditation type`,
				};
			}

			if (
				isTypeAccreditation === DIDAccreditationTypes.VerifiableAccreditationToAccredit ||
				isTypeAccreditation === DIDAccreditationTypes.VerifiableAccreditationToAttest
			) {
				const termsOfUse = accreditation.termsOfUse;
				if (!termsOfUse || !termsOfUse.parentAccreditation || !termsOfUse.rootAuthorization) {
					return {
						success: false,
						status: StatusCodes.BAD_REQUEST,
						data: initialVerifyResult,
						error: `Error on verifying accreditation ${accreditationUrl}: Missing parentAccreditaiton and rootAuthorization in termsOfUse for accreditation: ${accreditationUrl}`,
					};
				}

				if (isTypeAccreditation === DIDAccreditationTypes.VerifiableAccreditationToAccredit) {
					accreditorDids.push(accreditorDid);
				}

				accreditationUrl = termsOfUse.parentAccreditation;
				accreditedSubject = accreditorDid;
				accreditedFor = accreditation.credentialSubject.accreditedFor;

				if (rootAuthorization && rootAuthorization !== termsOfUse.rootAuthorization) {
					return {
						status: StatusCodes.OK,
						success: false,
						data: initialVerifyResult,
						error: `Error on verifying accreditation ${accreditationUrl}: Expected accreditation to be linked to root accreditation ${rootAuthorization}, but found it linked to DID ${termsOfUse.rootAuthorization} instead`,
					};
				}

				rootAuthorization = termsOfUse.rootAuthorization;
			} else {
				const results = await Promise.all(deactivatedDidsCheckPromises);
				const deactivatedDids = results.filter((r) => r);

				if (rootAuthorization && parseDidFromDidUrl(rootAuthorization) !== accreditation.credentialSubject.id) {
					return {
						status: StatusCodes.OK,
						success: false,
						data: {
							...initialVerifyResult,
							accreditorDids,
							rootAuthorization: accreditation.credentialSubject.id,
							termsOfUse: accreditation.termsOfUse,
						},
						error: `Error on verifying accreditation ${accreditationUrl}: Expected accreditation to be linked to root accreditation ${rootAuthorization}, but found it linked to DID ${accreditation.credentialSubject.id} instead`,
					};
				}
				if (deactivatedDids.length > 0) {
					return {
						status: StatusCodes.OK,
						success: false,
						data: initialVerifyResult,
						error: `Error on verifying accreditation ${accreditationUrl}: DIDs ${deactivatedDids.join(', ')} are deactivated in the trust chain`,
					};
				}

				return {
					status: StatusCodes.OK,
					success: true,
					data: {
						...initialVerifyResult,
						accreditorDids,
						rootAuthorization: accreditation.credentialSubject.id,
						termsOfUse: accreditation.termsOfUse,
					},
				};
			}
		}
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
			const { resources } = await identityServiceStrategySetup.agent.findLatestResourcesVersionsByType!(
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
						const res = await identityServiceStrategySetup.agent.resolve(url, true);
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
			return {
				success: false,
				status: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Error)?.message || error}`,
			};
		}
	}
}
