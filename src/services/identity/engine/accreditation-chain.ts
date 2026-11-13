/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { DIDAccreditationTypes } from '../../../types/accreditation.js';
import { parseDidFromDidUrl } from '../../../helpers/helpers.js';
import type { EngineAccreditationOutcome, EngineAccreditationVerifyRequest } from './types.js';

/**
 * The trust-chain walk behind `IdentityEngine.verifyAccreditation`, written once and shared by both engines. It holds
 * Studio's rules (subject, `accreditedFor`, accreditation types, `termsOfUse`, root authorisation, deactivated
 * issuers) and nothing engine-specific: each engine supplies the three things that touch its own stack.
 *
 * The Veramo engine passes no limits, so its walk is exactly the loop `AccreditationService` always ran. The Credo
 * engine passes a depth limit and cycle detection: a chain whose parent link leads back into itself would otherwise
 * make the walk run for ever.
 */

export interface AccreditationChainPorts {
	/** The accreditation at a DID URL as the resolver answers it. A body with `dereferencingMetadata` means not found. */
	resolve(didUrl: string): Promise<any>;
	/** True when the DID that issued `credential` is deactivated. Started as soon as a link is read, awaited at the root. */
	isIssuerDeactivated(credential: any): Promise<boolean>;
	/** Verifies the credential's signature and, when asked, its status. `valid: false` plus `message` means revoked or suspended. */
	verifyCredential(credential: any, options: { verifyStatus: boolean; policies?: any }): Promise<any>;
}

export interface AccreditationChainLimits {
	/** Most links followed before the walk gives up. */
	maxDepth?: number;
	/** Refuse a chain that names a link it has already visited. */
	detectCycles?: boolean;
}

export async function walkAccreditationChain(
	ports: AccreditationChainPorts,
	request: EngineAccreditationVerifyRequest,
	limits: AccreditationChainLimits = {}
): Promise<EngineAccreditationOutcome> {
	const { verifyStatus, allowDeactivatedDid, policies } = request;
	let { rootAuthorization, accreditedFor } = request;
	let accreditationUrl = request.didUrl;
	let accreditedSubject = request.subjectDid;
	let initialVerifyResult: any = undefined;
	const accreditorDids: string[] = [];
	const visited = new Set<string>();
	let depth = 0;

	const deactivatedDidsCheckPromises: Promise<boolean>[] = [];

	while (true) {
		depth++;
		if (limits.maxDepth !== undefined && depth > limits.maxDepth) {
			return {
				success: false,
				status: StatusCodes.BAD_REQUEST,
				data: initialVerifyResult,
				error: `Error on verifying accreditation ${accreditationUrl}: The trust chain is longer than the ${limits.maxDepth} links this service follows`,
			};
		}
		if (limits.detectCycles) {
			if (visited.has(accreditationUrl)) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: The trust chain refers back to an accreditation it has already passed through`,
				};
			}
			visited.add(accreditationUrl);
		}

		const result = await ports.resolve(accreditationUrl);

		if (result.dereferencingMetadata) {
			return {
				success: false,
				status: StatusCodes.NOT_FOUND,
				data: initialVerifyResult,
				error: `Error on verifying accreditation ${accreditationUrl}: DID URL ${accreditationUrl} is not found`,
			};
		}

		// Create credential object
		const accreditation: any = result;
		const accreditorDid = typeof accreditation.issuer === 'string' ? accreditation.issuer : accreditation.issuer.id;

		// Check if issuer DID is deactivated
		if (!allowDeactivatedDid) {
			deactivatedDidsCheckPromises.push(ports.isIssuerDeactivated(accreditation));
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
					(accredited: any) =>
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

		const verifyResult = await ports.verifyCredential(accreditation, { verifyStatus, policies });

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
