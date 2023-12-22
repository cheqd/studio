import { CheqdW3CVerifiableCredential, ICheqdCredential } from '../../services/w3c_credential.js';
import type { CheqdCredentialStatus } from '../../types/shared.js';
import { CredentialStatusValidator } from './credential-status.js';
import { CheqdDIDValidator, KeyDIDValidator } from './did.js';
import { JWTProofValidator } from './jwt-proof.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { InvalidTokenError, jwtDecode } from 'jwt-decode';

export class CheqdW3CVerifiableCredentialValidator implements IValidator {
	protected proofValidators: IValidator[];
	protected issuerValidators: IValidator[];
	protected credentialStatusValidator: IValidator;

	constructor(
		proofValidators?: IValidator[],
		issuerValidators?: IValidator[],
		credentialStatusValidator?: IValidator
	) {
		if (!proofValidators) {
			proofValidators = [new JWTProofValidator()];
		}
		if (!issuerValidators) {
			issuerValidators = [new KeyDIDValidator(), new CheqdDIDValidator()];
		}
		if (!credentialStatusValidator) {
			credentialStatusValidator = new CredentialStatusValidator();
		}
		this.proofValidators = proofValidators;
		this.issuerValidators = issuerValidators;
		this.credentialStatusValidator = credentialStatusValidator;
	}

	validate(credential: Validatable): IValidationResult {
		if (typeof credential === 'string') {
			try {
				jwtDecode(credential);
				new CheqdW3CVerifiableCredential(credential);
			} catch (e) {
				if (e instanceof InvalidTokenError) {
					return {
						valid: false,
						error: `Credential is not a valid JWT string: ${e.message}`,
					};
				}
				return {
					valid: false,
					error: `Credential is not a valid JWT string: ${(e as Error)?.message || e}`,
				};
			}
			// If we can create a CheqdW3CVerifiableCredential from a string - it's valid credential
			return { valid: true };
		}
		const cheqdCredential = credential as ICheqdCredential;

		if (!cheqdCredential.issuer) {
			return {
				valid: false,
				error: 'credential.issuer is required',
			};
		}
		if (!cheqdCredential.issuanceDate) {
			return {
				valid: false,
				error: 'credential.issuanceDate is required',
			};
		}
		if (!cheqdCredential.credentialSubject) {
			return {
				valid: false,
				error: 'credential.credentialSubject is required',
			};
		}
		// Validate proof
		if (!cheqdCredential.proof) {
			return {
				valid: false,
				error: 'credential.proof is required',
			};
		}
		const proof = cheqdCredential.proof as Validatable;
		const results = this.proofValidators.map((v) => v.validate(proof));
		if (results.some((r) => !r.valid)) {
			return {
				valid: false,
				error: `credential.proof has validation errors: ${results.map((r) => r.error).join(', ')}`,
			};
		}

		// Validate issuer
		const issuer = typeof cheqdCredential.issuer === 'string' ? cheqdCredential.issuer : cheqdCredential.issuer.id;
		const issuerResult = this.issuerValidators.map((v) => v.validate(issuer));
		if (issuerResult.every((r) => !r.valid)) {
			return {
				valid: false,
				error: `credential.issuer has validation errors: ${issuerResult.map((r) => r.error).join(', ')}`,
			};
		}

		// Validate credential status
		if (cheqdCredential.credentialStatus) {
			const credentialStatus = cheqdCredential.credentialStatus as CheqdCredentialStatus;
			const credentialStatusResult = this.credentialStatusValidator.validate(credentialStatus);
			if (!credentialStatusResult.valid) {
				return {
					valid: false,
					error: `credential.credentialStatus has validation error: ${credentialStatusResult.error}`,
				};
			}
		}

		return { valid: true };
	}
}
