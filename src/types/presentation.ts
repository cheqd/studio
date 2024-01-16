import type {
	IVerifyResult,
	VerifiablePresentation,
	VerificationPolicies,
	W3CVerifiableCredential,
	W3CVerifiablePresentation,
} from '@veramo/core';
import type { UnsuccessfulResponseBody, VerificationOptions } from './shared.js';

// Requests
export type CreatePresentationRequestBody = {
	credentials: W3CVerifiableCredential[];
	holderDid: string;
	verifierDid: string;
};

export type VerifyPresentationRequestBody = {
	presentation: W3CVerifiablePresentation;
	verifierDid: string;
	policies: VerificationPolicies;
	makeFeePayment: boolean;
};

// Positive

export type CreatePresentationResponseBody = VerifiablePresentation;

export type VerifyPresentationResponseQuery = VerificationOptions;

export type VerifyPresentationResponseBody = IVerifyResult;

// Negative

export type UnsuccessfulVerifyCredentialResponseBody = UnsuccessfulResponseBody | VerifyPresentationResponseBody;

export type UnsuccessfulCreatePresentationResponseBody = UnsuccessfulResponseBody;
