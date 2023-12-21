import { VerificationMethods } from '@cheqd/sdk';
import type { IValidationResult, IValidator } from './validator.js';
import type { VerificationMethod } from 'did-resolver';
import { base58btc } from 'multiformats/bases/base58';
import bs58 from 'bs58';
import { ValidateEd25519PubKey } from './utils.js';
import { Helpers, IHelpers } from './helpers.js';
import { DIDDocumentIDValidator } from './did-document-id.js';
import { CheqdControllerValidator } from './controller.js';

export class VerificationMethodValidator implements IValidator {
	protected verificationMethodValidators: IValidator[];
	protected didDocumentIDValidator: IValidator;
	protected controllerValidator: IValidator;

	helpers: Helpers;

	constructor(
		verificationMethodValidators?: IValidator[],
		controllerValidator?: IValidator,
		didDocumentIDValidator?: IValidator,
		helpers?: IHelpers
	) {
		if (!verificationMethodValidators) {
			verificationMethodValidators = [
				new Ed25519VerificationKey2020Validator(),
				new Ed25519VerificationKey2018Validator(),
				new JsonWebKey2020Validator(),
			];
		}
		if (!controllerValidator) {
			controllerValidator = new CheqdControllerValidator();
		}
		if (!didDocumentIDValidator) {
			didDocumentIDValidator = new DIDDocumentIDValidator();
		}
		if (!helpers) {
			helpers = new Helpers();
		}
		this.verificationMethodValidators = verificationMethodValidators;
		this.controllerValidator = controllerValidator;
		this.didDocumentIDValidator = didDocumentIDValidator;
		this.helpers = helpers;
	}

	validateEach(verificationMethod: VerificationMethod): IValidationResult {
		verificationMethod = verificationMethod as VerificationMethod;
		if (!verificationMethod.id) {
			return {
				valid: false,
				error: 'verificationMethod.id is required',
			};
		}
		if (!verificationMethod.type) {
			return {
				valid: false,
				error: 'verificationMethod.type is required',
			};
		}
		const id = verificationMethod.id;
		let _v = this.didDocumentIDValidator.validate(id);
		if (!_v.valid) {
			return {
				valid: false,
				error: `verificationMethod.id has validation error: ${_v.error}`,
			};
		}

		// Check controller
		if (verificationMethod.controller) {
			_v = this.controllerValidator.validate([verificationMethod.controller]);
			if (!_v.valid) {
				return {
					valid: false,
					error: `verificationMethod.controller has validation error: ${_v.error}`,
				};
			}
		}

		const validatorVM = this.verificationMethodValidators.find((v) => v.subject === verificationMethod.type);
		if (!validatorVM) {
			return {
				valid: false,
				error: `verificationMethod.type ${verificationMethod.type} is not supported`,
			};
		}
		_v = validatorVM.validate(verificationMethod);
		if (!_v?.valid) {
			return {
				valid: false,
				error: _v?.error,
			};
		}
		return { valid: true };
	}

	isUnique(ids: string[]) {
		return this.helpers.isUnique(ids);
	}

	validate(verificationMethods: VerificationMethod[]): IValidationResult {
		verificationMethods = verificationMethods as VerificationMethod[];

		// Check that IDs are unique
		const ids = verificationMethods.map((vm) => vm.id);
		if (!this.isUnique(ids)) {
			return {
				valid: false,
				error: 'verificationMethod.id values are not unique',
			};
		}
		// Check that all verification methods are valid
		const results = verificationMethods.map((vm) => this.validateEach(vm));
		if (results.some((v) => !v.valid)) {
			return {
				valid: false,
				error:
					'verificationMethod entries are not valid. Failed verification method checks: ' +
					results.map((v) => v.error).join(', '),
			};
		}
		return { valid: true };
	}
}

export class Ed25519VerificationKey2020Validator implements IValidator {
	subject = VerificationMethods.Ed255192020;

	printable(): string {
		return this.subject;
	}

	validate(value: VerificationMethod): IValidationResult {
		value = value as VerificationMethod;
		if (!value.publicKeyMultibase) {
			return {
				valid: false,
				error: 'publicKeyMultibase is required for Ed25519VerificationKey2020',
			};
		}
		const keyBytes = base58btc.decode(value.publicKeyMultibase);
		if (keyBytes[0] != 0xed) {
			return {
				valid: false,
				error: 'publicKeyMultibase is not valid Ed25519VerificationKey2020. The first byte is not 0xED',
			};
		}
		if (keyBytes[1] != 0x01) {
			return {
				valid: false,
				error: 'publicKeyMultibase is not valid Ed25519VerificationKey2020. The second byte is not 0x01',
			};
		}
		const publicKeyBytes = keyBytes.slice(2);
		const _v = ValidateEd25519PubKey(publicKeyBytes);
		if (!_v.valid) {
			return {
				valid: false,
				error: 'publicKeyMultibase is not valid Ed25519VerificationKey2020. ${_v.error}',
			};
		}
		return { valid: true };
	}
}

export class Ed25519VerificationKey2018Validator implements IValidator {
	subject = VerificationMethods.Ed255192018;

	printable(): string {
		return this.subject;
	}

	validate(value: VerificationMethod): IValidationResult {
		value = value as VerificationMethod;
		if (!value.publicKeyBase58) {
			return {
				valid: false,
				error: 'publicKeyBase58 is required for Ed25519VerificationKey2018',
			};
		}
		const keyBytes = bs58.decode(value.publicKeyBase58);
		const _v = ValidateEd25519PubKey(keyBytes);
		if (!_v.valid) {
			return {
				valid: false,
				error: `publicKeyBase58 is not valid Ed25519VerificationKey2018. ${_v.error}`,
			};
		}
		return { valid: true };
	}
}

export class JsonWebKey2020Validator implements IValidator {
	subject = VerificationMethods.JWK;

	printable(): string {
		return this.subject;
	}

	validate(value: VerificationMethod): IValidationResult {
		value = value as VerificationMethod;
		if (!value.publicKeyJwk) {
			return {
				valid: false,
				error: 'publicKeyJwk is required for JsonWebKey2020',
			};
		}
		switch (value.publicKeyJwk.kty) {
			case 'RSA':
				break;
			case 'EC':
				break;
			case 'OKP': {
				if (value.publicKeyJwk.crv != 'Ed25519') {
					return {
						valid: false,
						error: 'Cheqd ledger supports only Ed25519 curve for JsonWebKey2020',
					};
				}
				if (!value.publicKeyJwk.x) {
					return {
						valid: false,
						error: 'publicKeyJwk is not valid JsonWebKey2020. x is required',
					};
				}
				break;
			}
			default:
				return {
					valid: false,
					error: 'publicKeyJwk is not valid JsonWebKey2020. kty is not OKP or RSA or EC',
				};
		}
		return { valid: true };
	}
}
