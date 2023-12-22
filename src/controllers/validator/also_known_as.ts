import { DIDURIValidator } from './did-uri.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class AlsoKnownAsValidator implements IValidator {
	protected didURIValidator: IValidator;

	constructor(didURIValidator?: IValidator) {
		if (!didURIValidator) {
			didURIValidator = new DIDURIValidator();
		}
		this.didURIValidator = didURIValidator;
	}

	validateEach(didURI: string): IValidationResult {
		return this.didURIValidator.validate(didURI);
	}

	validate(alsoKnownAs: Validatable): IValidationResult {
		alsoKnownAs = alsoKnownAs as string[];
		if (!Array.isArray(alsoKnownAs)) {
			return {
				valid: false,
				error: 'AlsoKnownAs must be an array.',
			};
		}

		const results = alsoKnownAs.map((aka) => this.validateEach(aka));
		if (results.some((result) => !result.valid)) {
			return {
				valid: false,
				error: 'AlsoKnownAs has validation errors: ' + results.map((r) => r.error).join(', '),
			};
		}

		return { valid: true };
	}
}
