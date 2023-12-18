import { ExpressValidator } from 'express-validator';
import { DIDValidator } from './did.js';
import { DIDDocumentValidator } from './did_document.js';
import type { Validatable } from './validator.js';
import type { VerificationMethod } from 'did-resolver';
import { VerificationMethodValidator } from './verification_method.js';
import { CreateDIDDocumentServiceValidator } from './service_create_request.js';
import type { CreateDIDService } from '../../types/shared.js';

export const { check, validationResult } = new ExpressValidator({
	isDID: (value: Validatable) => {
		const res = new DIDValidator().validate(value);
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

	// isW3CCredential: (value) => {
	//     const res = new W3CCredentialValidator(value).validate();
	//     if (!res.valid) {
	//         throw new Error(res.error);
	//     }
	//     return true;
	// }
});
