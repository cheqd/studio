import type { IVerifyResult, VerifiableCredential, VerificationPolicies } from '@veramo/core';
import type { StatusOptions } from './credential-status.js';
import type { UnsuccessfulResponseBody } from './shared.js';
import type { BulkRevocationResult, BulkSuspensionResult, BulkUnsuspensionResult, RevocationResult, SuspensionResult, UnsuspensionResult } from '@cheqd/did-provider-cheqd';

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

export type VerifyCredentialResponseBody = IVerifyResult;

export type RevokeCredentialResponseBody = RevocationResult | BulkRevocationResult;

export type SuspendCredentialResponseBody = SuspensionResult | BulkSuspensionResult;

export type UnsuspendCredentialResponseBody = UnsuspensionResult | BulkUnsuspensionResult;

// Negative

export type UnsuccesfulIssueCredentialResponseBody = UnsuccessfulResponseBody;

export type UnsuccesfulRevokeredentialResponseBody = UnsuccessfulResponseBody;

export type UnsuccesfulReinstateCredentialResponseBody = UnsuccessfulResponseBody;

export type UnsuccesfulVerifyCredentialResponseBody = VerifyCredentialResponseBody & UnsuccessfulResponseBody;

export type UnsuccesfulRevokeCredentialResponseBody = { revoked: boolean } & UnsuccessfulResponseBody;

export type UnsuccesfulSuspendCredentialResponseBody = { suspended: boolean } & UnsuccessfulResponseBody;

export type UnsuccesfulUnsuspendCredentialResponseBody = { unsuspended: boolean } & UnsuccessfulResponseBody;
