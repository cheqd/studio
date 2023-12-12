import { DIDValidator } from "./did.js";
import type { IValidationResult, IValidator, Validatable } from "./validator";

export class CheqdControllerValidator implements IValidator {
    protected didValidator: IValidator;

    constructor(didValidator?: IValidator) {
        if (!didValidator) {
            didValidator = new DIDValidator();
        }
        this.didValidator = didValidator;
    }

    validate(controller: Validatable): IValidationResult {
        if (!Array.isArray(controller)) {
            return {
                valid: false,
                error: 'Controller should be an array',
            };
        }
        controller = controller as string[];
        if (controller.length === 0) {
            return {
                valid: false,
                error: 'Controller should not be empty',
            };
        }
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