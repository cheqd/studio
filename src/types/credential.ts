import type { VerifiableCredential, VerificationPolicies } from '@veramo/core';
import type { StatusOptions } from './credential-status.js';
import type { UnsuccessfulResponseBody } from './shared.js';

export interface CredentialRequest {
	subjectDid: string;
	attributes: Record<string, unknown>;
	'@context'?: string[];
	type?: string[];
	expirationDate?: DateType;
	issuerDid: string;
	format: 'jsonld' | 'jwt';
	credentialStatus?: StatusOptions;
	credentialSchema?: string;
	credentialName?: string;
	credentialSummary?: string;
}
export interface VerificationOptions {
	fetchRemoteContexts?: boolean;
	policies?: VerificationPolicies;
	domain?: string;
	verifyStatus?: boolean;
}
export type DateType = string | Date;

// Response bodies
// Positive

export type IssueCredentialResponseBody = VerifiableCredential;

export type VerifyCredentialResponseBody = { verified: boolean };

export type RevokeCredentialResponseBody = { revoked: boolean };

export type SuspendCredentialResponseBody = { suspended: boolean };

export type UnsuspendCredentialResponseBody = { unsuspended: boolean };

// Negative

export type UnsuccesfulIssueCredentialResponseBody = UnsuccessfulResponseBody;

export type UnsuccesfulRevokeredentialResponseBody = UnsuccessfulResponseBody;

export type UnsuccesfulReinstateCredentialResponseBody = UnsuccessfulResponseBody;

export type UnsuccesfulVerifyCredentialResponseBody = VerifyCredentialResponseBody & UnsuccessfulResponseBody;

export type UnsuccesfulRevokeCredentialResponseBody = RevokeCredentialResponseBody & UnsuccessfulResponseBody;

export type UnsuccesfulSuspendCredentialResponseBody = SuspendCredentialResponseBody & UnsuccessfulResponseBody;

export type UnsuccesfulUnsuspendCredentialResponseBody = UnsuspendCredentialResponseBody & UnsuccessfulResponseBody;
