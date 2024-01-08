import { JSONLD_PROOF_TYPES } from '../../types/constants.js';
import type { JSONLDProofType } from '../../types/validation.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class JsonLDProofValidator implements IValidator {
	validate(proof: Validatable): IValidationResult {
		proof = proof as JSONLDProofType;
		if (!proof) {
			return {
				valid: false,
				error: 'Proof is required',
			};
		}
		if (!proof.type) {
			return {
				valid: false,
				error: 'Proof.type is required',
			};
		}
		if (JSONLD_PROOF_TYPES.includes(proof.type) === false) {
			return {
				valid: false,
				error: `Only ${JSONLD_PROOF_TYPES.join(', ')} proof types are supported`,
			};
		}
		if (!proof.created) {
			return {
				valid: false,
				error: 'Proof.created is required',
			};
		}
		if (!proof.proofPurpose) {
			return {
				valid: false,
				error: 'Proof.proofPurpose is required',
			};
		}
		if (!proof.verificationMethod) {
			return {
				valid: false,
				error: 'Proof.verificationMethod is required',
			};
		}
		if (!proof.jws) {
			return {
				valid: false,
				error: 'Proof.jws is required',
			};
		}
		return { valid: true };
	}
}
