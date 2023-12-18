import { DIDValidator } from './did.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class DIDArrayValidator implements IValidator {
	protected didValidator: IValidator;

	constructor(didValidator?: IValidator) {
		if (!didValidator) {
			didValidator = new DIDValidator();
		}
		this.didValidator = didValidator;
	}

	validate(dids: Validatable): IValidationResult {
		dids = dids as string[];
		if (!Array.isArray(dids)) {
			return {
				valid: false,
				error: 'DID array should be an array',
			};
		}
		for (const did of dids) {
			const _v = this.didValidator.validate(did);
			if (!_v.valid) {
				return _v;
			}
		}
		return { valid: true };
	}
}
