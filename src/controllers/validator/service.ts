import type { Service } from 'did-resolver';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { DIDDocumentIDValudator } from './did_document_id.js';
import { Helpers, type IHelpers } from './helpers.js';

export class ServiceValidator implements IValidator {
	protected didDocumentIDValidator: IValidator;
	helpers: IHelpers;

	constructor(didDocumentIDValidator?: IValidator, helpers?: IHelpers) {
		if (!didDocumentIDValidator) {
			didDocumentIDValidator = new DIDDocumentIDValudator();
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
				error: 'Service id is required',
			};
		}
		if (!service.type) {
			return {
				valid: false,
				error: 'Service type is required',
			};
		}
		if (!service.serviceEndpoint) {
			return {
				valid: false,
				error: 'Service serviceEndpoint is required',
			};
		}
        if (!Array.isArray(service.serviceEndpoint)) {
            return {
                valid: false,
                error: 'Service serviceEndpoint should be an array',
            };
        }
		const id = service.id;
		const _v = this.didDocumentIDValidator.validate(id);
		if (!_v.valid) {
			return {
				valid: false,
				error: ` Service id has validation error: ${_v.error}`,
			};
		}

		return { valid: true };
	}

	validate(services: Validatable): IValidationResult {
        services = services as Service[];
        if (!Array.isArray(services)) {
            return {
                valid: false,
                error: 'Services should be an array',
            };
        }
		const ids = services.map((s) => s.id);
		if (!this.helpers.isUnique(ids)) {
			return {
				valid: false,
				error: 'Service ids are not unique',
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
