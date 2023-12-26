import type { IValidationResult, IValidator } from './validator.js';
import { parse } from 'uri-js';

export class DIDURIValidator implements IValidator {
	validate(didUri: string): IValidationResult {
		const _r = parse(didUri);
		if (_r.error) {
			return {
				valid: false,
				error: `did-uri has validation error: ${_r.error}`,
			};
		}
		return { valid: true };
	}
}
