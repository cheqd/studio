import { ExpressValidator } from 'express-validator';
import { DIDValidator, KeyDIDValidator } from './did.js';
import { DIDDocumentValidator } from './did-document.js';
import type { Validatable } from './validator.js';
import type { Service, VerificationMethod } from 'did-resolver';
import { VerificationMethodValidator } from './verification-method.js';
import { CreateDIDDocumentServiceValidator } from './service-create-request.js';
import type { CreateDIDService } from '../../types/validation.js';
import { ServiceValidator } from './service.js';
import { DIDArrayValidator } from './did-array.js';
import { CheqdDidLinkedAlsoKnownAsValidator } from './resource-also-known-as.js';
import { CheqdW3CVerifiableCredentialValidator } from './credential.js';
import { CheqdW3CVerifiablePresentationValidator } from './presentation.js';

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
	isCheqdDidLinkedAlsoKnownAs: (value: Validatable) => {
		const res = new CheqdDidLinkedAlsoKnownAsValidator().validate(value);
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
	},

	isW3CCheqdCredential: (value: Validatable) => {
		const res = new CheqdW3CVerifiableCredentialValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},

	isW3CCheqdPresentation: (value: Validatable) => {
		const res = new CheqdW3CVerifiablePresentationValidator().validate(value);
		if (!res.valid) {
			throw new Error(res.error);
		}
		return true;
	},
});
