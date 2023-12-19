import { ExpressValidator } from 'express-validator';
import { DIDValidator, KeyDIDValidator } from './did.js';
import { DIDDocumentValidator } from './did_document.js';
import type { Validatable } from './validator.js';
import type { Service, VerificationMethod } from 'did-resolver';
import { VerificationMethodValidator } from './verification_method.js';
import { CreateDIDDocumentServiceValidator } from './service_create_request.js';
import type { CreateDIDService } from '../../types/shared.js';
import { ServiceValidator } from './service.js';
import { DIDArrayValidator } from './did_array.js';
import { AlsoKnownAsValidator } from './also_known_as.js';

export const { check, validationResult, query, param } = new ExpressValidator({
	isDID: (value: Validatable) => {
		const res = new DIDValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isDIDArray: (value: Validatable) => {
		const res = new DIDArrayValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isDIDDocument: (value: Validatable) => {
		const res = new DIDDocumentValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isVerificationMethod: (value: VerificationMethod[]) => {
		const res = new VerificationMethodValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isCreateDIDDocumentService: (value: CreateDIDService[]) => {
		const res = new CreateDIDDocumentServiceValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isService: (value: Service[]) => {
		const res = new ServiceValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isAlsoKnownAs: (value: Validatable) => {
		const res = new AlsoKnownAsValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
	isKeyDID: (value: Validatable) => {
		const res = new KeyDIDValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	}

	// isW3CCredential: (value) => {
	//     const res = new W3CCredentialValidator(value).validate();
	//     if (!res.valid) {
	//         throw new Error(res.error);
	//     }
	//     return true;
	// }
});
