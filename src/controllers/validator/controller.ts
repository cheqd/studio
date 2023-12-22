import { DIDValidator } from './did.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';

export class CheqdControllerValidator implements IValidator {
	protected didValidator: IValidator;

	constructor(didValidator?: IValidator) {
		if (!didValidator) {
			didValidator = new DIDValidator();
		}
		this.didValidator = didValidator;
	}

	validate(controller: Validatable): IValidationResult {
		if (!Array.isArray(controller) && typeof controller !== 'string') {
			return {
				valid: false,
				error: 'didDocument.controller should be an array or just string',
			};
		}

		if (typeof controller === 'string') {
			controller = [controller];
		}

		controller = controller as string[];
		const results = controller.map((did) => this.didValidator.validate(did));
		if (results.some((r) => !r.valid)) {
			return {
				valid: false,
				error: results.map((r) => r.error).join(', '),
			};
		}
		return { valid: true };
	}
}
