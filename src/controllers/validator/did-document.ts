import type { DIDDocument } from '@cheqd/sdk';
import { DIDValidator } from './did.js';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { VerificationMethodValidator } from './verification-method.js';
import { CheqdControllerValidator } from './controller.js';
import { ServiceValidator } from './service.js';

export class DIDDocumentValidator implements IValidator {
	protected didValidator: IValidator;
	protected controllerValidator: IValidator;
	protected verificationMethodValidator: IValidator;
	protected serviceValidator: IValidator;

	constructor(
		didValidator?: IValidator,
		controllerValidator?: IValidator,
		verificationMethodValidator?: IValidator,
		serviceValidator?: IValidator
	) {
		if (!didValidator) {
			didValidator = new DIDValidator();
		}
		if (!controllerValidator) {
			controllerValidator = new CheqdControllerValidator();
		}

		if (!verificationMethodValidator) {
			verificationMethodValidator = new VerificationMethodValidator();
		}

		if (!serviceValidator) {
			serviceValidator = new ServiceValidator();
		}

		this.didValidator = didValidator;
		this.controllerValidator = controllerValidator;
		this.verificationMethodValidator = verificationMethodValidator;
		this.serviceValidator = serviceValidator;
	}

	validate(didDocument: Validatable): IValidationResult {
		didDocument = didDocument as DIDDocument;
		// Check spec compliance
		// id is required, validated on both compile and runtime
		if (!didDocument?.id) return { valid: false, error: 'id for DIDDocument is required' };

		// verificationMethod must be an array
		if (didDocument.verificationMethod && !Array.isArray(didDocument?.verificationMethod))
			return { valid: false, error: 'verificationMethod must be an array' };

		// Check id (id of DIDDocument must be valid DID)
		let _v = this.didValidator?.validate(didDocument.id);
		if (!_v?.valid) {
			return {
				valid: false,
				error: _v?.error,
			};
		}
		// Check controller
		if (didDocument.controller) {
			_v = this.controllerValidator?.validate(didDocument.controller);
			if (!_v?.valid) {
				return {
					valid: false,
					error: _v?.error,
				};
			}
		}
		// Check verification methods
		if (didDocument.verificationMethod) {
			_v = this.verificationMethodValidator.validate(didDocument.verificationMethod);
			if (!_v?.valid) {
				return {
					valid: false,
					error: _v?.error,
				};
			}
		}

		// Check service
		// It should be an array
		if (didDocument.service) {
			_v = this.serviceValidator.validate(didDocument.service);
			if (!_v?.valid) {
				return {
					valid: false,
					error: _v?.error,
				};
			}
		}
		return { valid: true };
	}
}
