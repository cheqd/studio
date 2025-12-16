import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { SafeAPIResponse } from '../../types/common.js';
import { AccreditationSchemaType, DIDAccreditationTypes, VerfifiableAccreditation } from '../../types/accreditation.js';
import { isCredentialIssuerDidDeactivated } from '../helpers.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import type { IVerifyResult, VerificationPolicies } from '@veramo/core';
import { CheqdW3CVerifiableCredential } from '../w3c-credential.js';
import { StatusCodes } from 'http-status-codes';
import { parseDidFromDidUrl } from '../../helpers/helpers.js';

export class AccreditationService {
	public static instance = new AccreditationService();

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
			const res = await identityServiceStrategySetup.agent.resolve(accreditationUrl);

			const result = await res.json();

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

			accreditorDids.push(accreditorDid);

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

			if (verifyStatus && !accreditation.credentialStatus) {
				verifyStatus = false;
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
}
