import { BitstringStatusPurposeTypes, DefaultStatusList2021StatusPurposeTypes } from '@cheqd/did-provider-cheqd';
import { BitstringStatusListEntry } from '../../types/constants.js';
import type { IValidationResult, IValidator } from './validator.js';
import { CheqdCredentialStatus } from '../../types/credential-status.js';

export class CredentialStatusValidator implements IValidator {
	validate(credentialStatus: CheqdCredentialStatus): IValidationResult {
		if (!credentialStatus.id) {
			return {
				valid: false,
				error: 'credentialStatus.id is required',
			};
		}
		if (!credentialStatus.type) {
			return {
				valid: false,
				error: 'credentialStatus.type is required',
			};
		}
		if (!credentialStatus.statusPurpose) {
			return {
				valid: false,
				error: 'credentialStatus.statusPurpose is required',
			};
		}
		if (!credentialStatus.statusListIndex) {
			return {
				valid: false,
				error: 'credentialStatus.statusListIndex is required',
			};
		}
		if (credentialStatus.type === BitstringStatusListEntry) {
			const validPurposes = Object.keys(BitstringStatusPurposeTypes);
			if (!validPurposes.includes(credentialStatus.statusPurpose)) {
				return {
					valid: false,
					error: `credentialStatus.statusPurpose must be one of ${validPurposes.join(', ')}`,
				};
			}
		} else {
			if (
				credentialStatus.statusPurpose !== DefaultStatusList2021StatusPurposeTypes.revocation &&
				credentialStatus.statusPurpose !== DefaultStatusList2021StatusPurposeTypes.suspension
			) {
				return {
					valid: false,
					error: 'credentialStatus.statusPurpose must be "revocation" or "suspension"',
				};
			}
		}
		return { valid: true };
	}
}
