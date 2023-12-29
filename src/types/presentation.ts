import type { IVerifyResult, VerifiablePresentation } from '@veramo/core';
import type { UnsuccessfulResponseBody } from './shared.js';

// Positive

export type VerifyPresentationResponseBody = IVerifyResult;

export type CreatePresentationResponseBody = VerifiablePresentation;

// Negative

export type UnsuccessfulVerifyCredentialResponseBody = UnsuccessfulResponseBody & VerifyPresentationResponseBody;

export type UnsuccessfulCreatePresentationResponseBody = UnsuccessfulResponseBody;
