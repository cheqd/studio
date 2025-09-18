import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { Helpers, type IHelpers } from './helpers.js';
import type { CreateDIDService } from '../../types/validation.js';

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
		if (!Array.isArray(service.serviceEndpoint) || typeof service.serviceEndpoint === 'string') {
			return {
				valid: false,
				error: `service.serviceEndpoint should be an array or a string in object ${service}`,
			};
		}
		// Optional fields validation
		if (service.priority !== undefined && (typeof service.priority !== 'number' || service.priority < 0)) {
			return { valid: false, error: `service.priority should be a non-negative number in object ${service}` };
		}

		if (
			service.accept !== undefined &&
			(!Array.isArray(service.accept) || !service.accept.every((item) => typeof item === 'string'))
		) {
			return { valid: false, error: `service.accept should be an array of strings in object ${service}` };
		}

		if (
			service.routingKeys !== undefined &&
			(!Array.isArray(service.routingKeys) || !service.routingKeys.every((key) => typeof key === 'string'))
		) {
			return { valid: false, error: `service.routingKeys should be an array of strings in object ${service}` };
		}

		if (
			service.recipientKeys !== undefined &&
			(!Array.isArray(service.recipientKeys) || !service.recipientKeys.every((key) => typeof key === 'string'))
		) {
			return { valid: false, error: `service.recipientKeys should be an array of strings in object ${service}` };
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
				error:
					'Service for Create DID Request has validation errors: ' + results.map((r) => r.error).join(', '),
			};
		}
		return { valid: true };
	}
}
