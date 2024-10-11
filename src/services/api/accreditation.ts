import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { SafeAPIResponse } from '../../types/common.js';
import { AccreditationSchemaType, DIDAccreditationTypes, VerfifiableAccreditation } from '../../types/accreditation.js';
import { isCredentialIssuerDidDeactivated } from '../helpers.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import type { IVerifyResult, VerificationPolicies } from '@veramo/core';
import { CheqdW3CVerifiableCredential } from '../w3c-credential.js';
import { StatusCodes } from 'http-status-codes';

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
	): Promise<SafeAPIResponse<{ verified: boolean }>> {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		let accreditationUrl = didUrl;
		let accreditedSubject = subjectDid;
		let initialVerifyResult: IVerifyResult | undefined = undefined;

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

			if (
				!allowDeactivatedDid &&
				(await isCredentialIssuerDidDeactivated(accreditation as unknown as CheqdW3CVerifiableCredential))
			) {
				return {
					success: false,
					status: StatusCodes.BAD_REQUEST,
					data: initialVerifyResult,
					error: `Error on verifying accreditation ${accreditationUrl}: Issuer DID is deactivated`,
				};
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
						(accredited) => accredited.type === schema.type && accredited.schemaId === schema.schemaId
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

				const accreditorDid =
					typeof accreditation.issuer === 'string' ? accreditation.issuer : accreditation.issuer.id;

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
				return {
					status: StatusCodes.OK,
					success: true,
					data: initialVerifyResult,
				};
			}
		}
	}
}
