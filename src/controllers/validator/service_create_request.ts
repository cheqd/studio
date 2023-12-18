import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { Helpers, type IHelpers } from './helpers.js';
import type { CreateDIDService } from '../../types/shared.js';

// It's a special validator for the service create request. It's not a part of the DID Document
export class CreateDIDDocumentServiceValidator implements IValidator {
    helpers: IHelpers;

    constructor(helpers?: IHelpers) {
        if (!helpers) {
            helpers = new Helpers();
        }
        this.helpers = helpers;
    }

	validateEach(service: CreateDIDService): IValidationResult {
		if (!service.idFragment) {
			return {
				valid: false,
				error: `Service object ${service} is invalid. idFragment is required`,
			};
		}
		if (!service.type) {
			return {
				valid: false,
				error: `Service object ${service} is invalid. type is required`,
			};
		}
		if (!service.serviceEndpoint) {
			return {
				valid: false,
				error: `Service object ${service} is invalid. serviceEndpoint is required`,
			};
		}
        if (!Array.isArray(service.serviceEndpoint)) {
            return {
                valid: false,
                error: `Service object ${service} is invalid. ServiceEndpoint should be an array`,
            };
        }
		return { valid: true };
	}

	validate(services: Validatable): IValidationResult {
        services = services as CreateDIDService[];
        if (!Array.isArray(services)) {
            return {
                valid: false,
                error: 'Service value for CreateDID Request should be an array',
            };
        }
		const ids = services.map((s) => s.idFragment);
		if (!this.helpers.isUnique(ids)) {
			return {
				valid: false,
				error: 'Service for CreateDID Request has not unique ids',
			};
		}

		const results = services.map((s) => this.validateEach(s));
		if (results.some((r) => !r.valid)) {
			return {
				valid: false,
				error: 'Service for CreateDID Request has validation errors: ' + results.map((r) => r.error).join(', '),
			};
		}
		return { valid: true };
	}
}
