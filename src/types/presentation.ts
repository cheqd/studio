import type { VerifiablePresentation } from '@veramo/core';
import type { UnsuccessfulResponseBody } from './shared.js';

// Positive

export type VerifyPresentationResponseBody = { verified: boolean };

export type CreatePresentationResponseBody = VerifiablePresentation;

// Negative

export type UnsuccessfulVerifyCredentialResponseBody = UnsuccessfulResponseBody & VerifyPresentationResponseBody;

export type UnsuccessfulCreatePresentationResponseBody = UnsuccessfulResponseBody;
