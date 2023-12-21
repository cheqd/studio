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
				error: `service.id is required in object ${service}`,
			};
		}
		if (!service.type) {
			return {
				valid: false,
				error: `service.type is required in object ${service}`,
			};
		}
		if (!service.serviceEndpoint) {
			return {
				valid: false,
				error: `service.serviceEndpoint is required in object ${service}`,
			};
		}
		if (!Array.isArray(service.serviceEndpoint)) {
			return {
				valid: false,
				error: `service.serviceEndpoint should be an array in object ${service}`,
			};
		}
		return { valid: true };
	}

	validate(services: Validatable): IValidationResult {
		services = services as CreateDIDService[];
		if (!Array.isArray(services)) {
			return {
				valid: false,
				error: 'Service value for Create DID Request should be an array',
			};
		}
		const ids = services.map((s) => s.idFragment);
		if (!this.helpers.isUnique(ids)) {
			return {
				valid: false,
				error: 'Service for Create DID Request does not have unique service.',
			};
		}

		const results = services.map((s) => this.validateEach(s));
		if (results.some((r) => !r.valid)) {
			return {
				valid: false,
				error: 'Service for Create DID Request has validation errors: ' + results.map((r) => r.error).join(', '),
			};
		}
		return { valid: true };
	}
}
