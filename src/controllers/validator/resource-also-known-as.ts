import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2/resource.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class CheqdDidLinkedAlsoKnownAsValidator implements IValidator {
	validateEach(alsoKnownAs: AlternativeUri): IValidationResult {
		if (!alsoKnownAs.uri) {
			return {
				valid: false,
				error: 'alsoKnownAs.uri field is required',
			};
		}

		if (typeof alsoKnownAs.uri !== 'string') {
			return {
				valid: false,
				error: 'alsoKnownAs.uri field must be a string',
			};
		}

		if (!alsoKnownAs.description) {
			return {
				valid: false,
				error: 'alsoKnownAs.description field is required',
			};
		}
		if (typeof alsoKnownAs.description !== 'string') {
			return {
				valid: false,
				error: 'alsoKnownAs.description field must be a string',
			};
		}
		return { valid: true };
	}

	validate(alsoKnownAs: Validatable): IValidationResult {
		alsoKnownAs = alsoKnownAs as AlternativeUri[];
		if (!Array.isArray(alsoKnownAs)) {
			return {
				valid: false,
				error: 'alsoKnownAs must be an array.',
			};
		}

		const results = alsoKnownAs.map((aka) => this.validateEach(aka));
		if (results.some((result) => !result.valid)) {
			return {
				valid: false,
				error: 'alsoKnownAs has validation errors: ' + results.map((r) => r.error).join(', '),
			};
		}

		return { valid: true };
	}
}
