import type { IVerifyResult, VerifiableCredential, VerificationPolicies, W3CVerifiableCredential } from '@veramo/core';
import type { StatusOptions } from './credential-status.js';
import type { UnsuccessfulResponseBody } from './shared.js';
import type {
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	RevocationResult,
	SuspensionResult,
	UnsuspensionResult,
} from '@cheqd/did-provider-cheqd';
import type { VerificationOptions } from './shared.js';

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
	termsOfUse?: AdditionalData[];
	evidence?: AdditionalData[];
	refreshService?: AdditionalData;

	[x: string]: any;
}

export type AdditionalData = {
	type: string | string[];
	id?: string;

	[x: string]: any;
};

export type VerificationPoliciesRequest = {
	policies: VerificationPolicies;
};

export type PubslishRequest = {
	publish?: boolean;
};

export type SymmetricKeyRequest = {
	symmetricKey?: string;
};

export type CredentialRequestBody = { credential: W3CVerifiableCredential } & SymmetricKeyRequest;

export type DateType = string | Date;

// Request bodies and queries

export type IssueCredentialRequestBody = CredentialRequest;

export type VerifyCredentialRequestBody = { credential: W3CVerifiableCredential } & VerificationPoliciesRequest;

export type VerifyCredentialRequestQuery = VerificationOptions;

export type RevokeCredentialRequestBody = CredentialRequestBody;

export type RevokeCredentialRequestQuery = PubslishRequest;

export type SuspendCredentialRequestBody = CredentialRequestBody;

export type SuspendCredentialRequestQuery = PubslishRequest;

export type UnsuspendCredentialRequestBody = CredentialRequestBody;

export type UnsuspendCredentialRequestQuery = PubslishRequest;

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

export type UnsuccesfulVerifyCredentialResponseBody = UnsuccessfulResponseBody | VerifyCredentialResponseBody;

export type UnsuccesfulRevokeCredentialResponseBody = Pick<RevocationResult, 'revoked'> | UnsuccessfulResponseBody;

export type UnsuccesfulSuspendCredentialResponseBody = Pick<SuspensionResult, 'suspended'> | UnsuccessfulResponseBody;

export type UnsuccesfulUnsuspendCredentialResponseBody =
	| Pick<UnsuspensionResult, 'unsuspended'>
	| UnsuccessfulResponseBody;
