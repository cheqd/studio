import type { CheqdCredentialStatus } from '../../types/shared.js';
import type { IValidationResult, IValidator } from './validator.js';

export class CredentialStatusValidator implements IValidator {
	validate(credentialStatus: CheqdCredentialStatus): IValidationResult {
		if (!credentialStatus) {
			return {
				valid: false,
				error: 'credentialStatus is required',
			};
		}

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
		if (credentialStatus.statusPurpose !== 'revocation' && credentialStatus.statusPurpose !== 'suspension') {
			return {
				valid: false,
				error: 'credentialStatus.statusPurpose must be "revocation" or "suspension"',
			};
		}
		return { valid: true };
	}
}
