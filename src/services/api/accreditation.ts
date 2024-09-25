import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { SafeAPIResponse } from '../../types/common.js';
import { DIDAccreditationTypes } from '../../types/accreditation.js';
import { isCredentialIssuerDidDeactivated } from '../helpers.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import { CheqdW3CVerifiableCredential } from '../w3c-credential.js';
import type { VerificationPolicies } from '@veramo/core';

export class AccreditationService {
	public static instance = new AccreditationService();

	async verify_accreditation(
		didUrl: string,
		verifyStatus: boolean,
		allowDeactivatedDid: boolean,
		customer: CustomerEntity,
		policies?: VerificationPolicies
	): Promise<SafeAPIResponse<{ verified: boolean; parentAccreditation?: boolean; rootAuthorisation?: boolean }>> {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		const res = await identityServiceStrategySetup.agent.resolve(didUrl);

		const result = await res.json();

		if (result.dereferencingMetadata) {
			return {
				success: false,
				status: 404,
				error: `DID Url ${didUrl} is not found`,
			};
		}

		// Create credential object
		const accreditation = new CheqdW3CVerifiableCredential(result);

		if (!allowDeactivatedDid && (await isCredentialIssuerDidDeactivated(accreditation))) {
			return {
				success: false,
				status: 400,
				error: `Credential issuer DID is deactivated`,
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

		if (verifyResult.error) {
			return {
				success: false,
				status: 200,
				error: `verify: ${verifyResult.error.message}`,
			};
		}

		if (!Array.isArray(accreditation.type)) {
			return {
				success: false,
				status: 200,
				error: `invalid accreditation type`,
			};
		}

		const accreditationTypes = Object.keys(DIDAccreditationTypes);
		const isTypeAccreditation = accreditation.type.find((x) => accreditationTypes.includes(x));

		if (!isTypeAccreditation) {
			return {
				success: false,
				status: 200,
				error: `invalid accreditation type`,
			};
		}

		if (
			isTypeAccreditation === DIDAccreditationTypes.VerifiableAccreditationToAccredit ||
			isTypeAccreditation === DIDAccreditationTypes.VerifiableAccreditationToAttest
		) {
			const termsOfUse = accreditation.termsOfUse;
			if (!termsOfUse || !termsOfUse.parentAccreditation || !termsOfUse.rootAuthorisation) {
				return {
					success: false,
					status: 200,
					error: `Invalid termsOfUse`,
				};
			}

			const parentAccreditation = (
				await this.verify_accreditation(
					termsOfUse.parentAccreditation,
					verifyStatus,
					allowDeactivatedDid,
					customer
				)
			).success;
			const rootAuthorisation = (
				await this.verify_accreditation(
					termsOfUse.rootAuthorisation,
					verifyStatus,
					allowDeactivatedDid,
					customer
				)
			).success;

			return {
				status: 200,
				success: true,
				data: { ...verifyResult, parentAccreditation, rootAuthorisation },
			};
		}

		return {
			status: 200,
			success: true,
			data: verifyResult,
		};
	}
}
