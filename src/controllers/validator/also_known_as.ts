import type { AlsoKnownAs } from '../../types/shared.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class AlsoKnownAsValidator implements IValidator {
	validateEach(alsoKnownAs: AlsoKnownAs): IValidationResult {
		if (!alsoKnownAs.uri) {
			return {
				valid: false,
				error: "AlsoKnownAs's uri field is required.",
			};
		}

		if (typeof alsoKnownAs.uri !== 'string') {
			return {
				valid: false,
				error: "AlsoKnownAs's uri field must be a string.",
			};
		}

		if (!alsoKnownAs.description) {
			return {
				valid: false,
				error: "AlsoKnownAs's description field is required.",
			};
		}
		if (typeof alsoKnownAs.description !== 'string') {
			return {
				valid: false,
				error: "AlsoKnownAs's description field must be a string.",
			};
		}
		return { valid: true };
	}

	validate(alsoKnownAs: Validatable): IValidationResult {
		alsoKnownAs = alsoKnownAs as AlsoKnownAs[];
		if (!Array.isArray(alsoKnownAs)) {
			return {
				valid: false,
				error: 'Also known as must be an array.',
			};
		}

		if (alsoKnownAs.length === 0) {
			return {
				valid: false,
				error: 'Also known as must not be empty.',
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
