import type { Service } from 'did-resolver';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { DIDDocumentIDValidator } from './did-document-id.js';
import { Helpers, type IHelpers } from './helpers.js';

export class ServiceValidator implements IValidator {
	protected didDocumentIDValidator: IValidator;
	helpers: IHelpers;

	constructor(didDocumentIDValidator?: IValidator, helpers?: IHelpers) {
		if (!didDocumentIDValidator) {
			didDocumentIDValidator = new DIDDocumentIDValidator();
		}
		if (!helpers) {
			helpers = new Helpers();
		}
		this.didDocumentIDValidator = didDocumentIDValidator;
		this.helpers = helpers;
	}

	validateEach(service: Service): IValidationResult {
		if (!service.id) {
			return {
				valid: false,
				error: 'service.id is required',
			};
		}
		if (!service.type) {
			return {
				valid: false,
				error: 'service.type is required',
			};
		}
		if (!service.serviceEndpoint) {
			return {
				valid: false,
				error: 'service.serviceEndpoint is required',
			};
		}
		if (!Array.isArray(service.serviceEndpoint)) {
			return {
				valid: false,
				error: 'service.serviceEndpoint should be an array',
			};
		}
		const id = service.id;
		const _v = this.didDocumentIDValidator.validate(id);
		if (!_v.valid) {
			return {
				valid: false,
				error: `service.id has validation error: ${_v.error}`,
			};
		}

		return { valid: true };
	}

	validate(services: Validatable): IValidationResult {
		services = services as Service[];
		if (!Array.isArray(services)) {
			return {
				valid: false,
				error: 'Service should be an array',
			};
		}
		const ids = services.map((s) => s.id);
		if (!this.helpers.isUnique(ids)) {
			return {
				valid: false,
				error: 'service.id entries are not unique',
			};
		}

		const results = services.map((s) => this.validateEach(s));
		if (results.some((r) => !r.valid)) {
			return {
				valid: false,
				error: 'Service has validation errors: ' + results.map((r) => r.error).join(', '),
			};
		}
		return { valid: true };
	}
}
