import { CheqdW3CVerifiablePresentation } from '../../services/w3c-presentation.js';
import { CheqdW3CVerifiableCredentialValidator } from './credential.js';
import { DIDValidator } from './did.js';
import { JWTProofValidator } from './jwt-proof.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { InvalidTokenError, jwtDecode } from 'jwt-decode';

export class CheqdW3CVerifiablePresentationValidator implements IValidator {
	protected proofValidators: IValidator[];
	protected credentialValidators: IValidator[];
	protected holderValidators: IValidator[];

	constructor(proofValidators?: IValidator[], credentialValidators?: IValidator[], holderValidators?: IValidator[]) {
		if (!proofValidators) {
			proofValidators = [new JWTProofValidator()];
		}
		if (!credentialValidators) {
			credentialValidators = [new CheqdW3CVerifiableCredentialValidator()];
		}
		if (!holderValidators) {
			holderValidators = [new DIDValidator()];
		}

		this.proofValidators = proofValidators;
		this.credentialValidators = credentialValidators;
		this.holderValidators = holderValidators;
	}

	validate(presentation: Validatable): IValidationResult {
		if (typeof presentation === 'string') {
			try {
				jwtDecode(presentation);
				new CheqdW3CVerifiablePresentation(presentation);
			} catch (e) {
				if (e instanceof InvalidTokenError) {
					return {
						valid: false,
						error: `Presentation is not a valid JWT string: ${e.message}`,
					};
				}
				return {
					valid: false,
					error: `Presentation is not a valid JWT string: ${(e as Error)?.message || e}`,
				};
			}
			// If we can create a CheqdW3CVerifiablePresentation from a string - it's valid credential
			return { valid: true };
		}

		const cheqdPresentation = presentation as CheqdW3CVerifiablePresentation;

		// Validate proof
		if (!cheqdPresentation.proof) {
			return {
				valid: false,
				error: 'Presentation proof is required',
			};
		}
		const proof = cheqdPresentation.proof as Validatable;
		const results = this.proofValidators.map((v) => v.validate(proof));
		if (results.some((r) => !r.valid)) {
			return {
				valid: false,
				error: `Presentation proof has validation errors: ${results.map((r) => r.error).join(', ')}`,
			};
		}

		// Validate credentials
		if (!cheqdPresentation.verifiableCredential) {
			return {
				valid: false,
				error: 'Presentation verifiableCredential is required',
			};
		}
		const credentials = cheqdPresentation.verifiableCredential as Validatable[];
		const credentialResults = credentials.map((c) => this.credentialValidators.map((v) => v.validate(c)));
		if (credentialResults.some((r) => r.some((cr) => !cr.valid))) {
			return {
				valid: false,
				error: `Presentation verifiableCredential has validation errors: ${credentialResults
					.map((r) => r.map((cr) => cr.error).join(', '))
					.join(', ')}`,
			};
		}

		// check holder
		if (!cheqdPresentation.holder) {
			return {
				valid: false,
				error: 'Presentation holder is required',
			};
		}
		const holder = cheqdPresentation.holder as Validatable;
		const holderResults = this.holderValidators.map((v) => v.validate(holder));
		if (holderResults.every((r) => !r.valid)) {
			return {
				valid: false,
				error: `Presentation holder has validation errors: ${holderResults.map((r) => r.error).join(', ')}`,
			};
		}

		return { valid: true };
	}
}
