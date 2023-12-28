import type { W3CVerifiableCredential, W3CVerifiablePresentation } from '@veramo/core';
import type { DIDDocument, VerificationMethod, Service } from 'did-resolver';
import type { IHelpers } from './helpers.js';
import type { CreateDIDService, JwtProof2020, JSONLDProofType, CheqdCredentialStatus } from '../../types/validation.js';
import type { ICheqdCredential } from '../../services/w3c-credential.js';
import type { ICheqdPresentation } from '../../services/w3c-presentation.js';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2/resource.js';

export type Validatable =
	| string
	| string[]
	| DIDDocument
	| W3CVerifiableCredential
	| W3CVerifiablePresentation
	| VerificationMethod
	| VerificationMethod[]
	| Service[]
	| CreateDIDService[]
	| AlternativeUri[]
	| ICheqdCredential
	| ICheqdPresentation
	| JwtProof2020
	| JSONLDProofType
	| CheqdCredentialStatus;

export interface IValidator {
	// in case of failure - raise an error, it's totally fine
	validate(value: Validatable): IValidationResult;
	printable?(): string;
	// What is the subject of validation
	subject?: string;
	helpers?: IHelpers;
}

export interface IValidationResult {
	valid: boolean;
	error?: string;
}
