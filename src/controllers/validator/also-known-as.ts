import type { AlsoKnownAs } from '../../types/shared.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class AlsoKnownAsValidator implements IValidator {
	validateEach(alsoKnownAs: AlsoKnownAs): IValidationResult {
		if (!alsoKnownAs.uri) {
			return {
				valid: false,
				error: "URI field is required for AlsoKnownAs",
			};
		}

		if (typeof alsoKnownAs.uri !== 'string') {
			return {
				valid: false,
				error: "URI field in AlsoKnownAs must be a string",
			};
		}

		if (!alsoKnownAs.description) {
			return {
				valid: false,
				error: "Description field is required for AlsoKnownAs",
			};
		}
		if (typeof alsoKnownAs.description !== 'string') {
			return {
				valid: false,
				error: "Description field in AlsoKnownAs must be a string",
			};
		}
		return { valid: true };
	}

	validate(alsoKnownAs: Validatable): IValidationResult {
		alsoKnownAs = alsoKnownAs as AlsoKnownAs[];
		if (!Array.isArray(alsoKnownAs)) {
			return {
				valid: false,
				error: 'AlsoKnownAs must be an array.',
			};
		}

		if (alsoKnownAs.length === 0) {
			return {
				valid: false,
				error: 'AlsoKnownAs must have at least one entry.',
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
