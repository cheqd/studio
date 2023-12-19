import { InvalidTokenError, jwtDecode } from 'jwt-decode';
import { JWT_PROOF_TYPE } from '../../types/constants';
import type { JwtProof2020 } from '../../types/shared';
import type { IValidationResult, IValidator, Validatable } from './validator';

export class JWTProofValidator implements IValidator {
	validate(proof: Validatable): IValidationResult {
		proof = proof as JwtProof2020;
		if (!proof) {
			return {
				valid: false,
				error: 'Proof is required',
			};
		}
		if (!proof.jwt) {
			return {
				valid: false,
				error: 'JWT is required',
			};
		}
		if (!proof.type) {
			return {
				valid: false,
				error: 'Proof type is required',
			};
		}
		if (proof.type !== JWT_PROOF_TYPE) {
			return {
				valid: false,
				error: `Only ${JWT_PROOF_TYPE} proof type is supported`,
			};
		}
		try {
			jwtDecode(proof.jwt);
		} catch (e) {
			// If it's not a JWT - just skip it
			if (e instanceof InvalidTokenError) {
				return {
					valid: false,
					error: `JWT is invalid: ${e.message}`,
				};
			}
		}

		return { valid: true };
	}
}
