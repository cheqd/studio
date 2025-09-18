import type { IVerifyResult, VerifiableCredential, VerificationPolicies, W3CVerifiableCredential } from '@veramo/core';
import type { StatusOptions } from './credential-status.js';
import type { UnsuccessfulResponseBody } from './shared.js';
import type {
	BitstringUpdateResult,
	BulkBitstringUpdateResult,
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	RevocationResult,
	SuspensionResult,
	UnsuspensionResult,
} from '@cheqd/did-provider-cheqd';
import type { VerificationOptions } from './shared.js';

export enum CredentialConnectors {
	Verida = 'verida',
	Resource = 'resource',
	Studio = 'studio',
	Dock = 'dock',
}

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
	termsOfUse?: AdditionalData | AdditionalData[];
	refreshService?: AdditionalData | AdditionalData[];
	evidence?: AdditionalData | AdditionalData[];
	connector?: CredentialConnectors;
	credentialId?: string;

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

export type PublishRequest = {
	publish?: boolean;
	listType?: string;
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

export type UpdateCredentialRequestBody = CredentialRequestBody;

export type UpdateCredentialRequestQuery = PublishRequest;

// Response bodies
// Positive

export type IssueCredentialResponseBody = VerifiableCredential;

export type VerifyCredentialResponseBody = IVerifyResult;

export type RevokeCredentialResponseBody =
	| RevocationResult
	| BulkRevocationResult
	| BitstringUpdateResult
	| BulkBitstringUpdateResult;

export type SuspendCredentialResponseBody =
	| SuspensionResult
	| BulkSuspensionResult
	| BitstringUpdateResult
	| BulkBitstringUpdateResult;

export type UnsuspendCredentialResponseBody =
	| UnsuspensionResult
	| BulkUnsuspensionResult
	| BitstringUpdateResult
	| BulkBitstringUpdateResult;

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

export type ListCredentialQueryParams = {
	providerId?: string;
	issuerDid?: string;
	network?: 'mainnet' | 'testnet';
	createdAt?: string;
	page?: number;
	limit?: number;
	id?: string;
	type?: string;
};

export type ListCredentialRequestOptions = {
	page?: number;
	limit?: number;
	filter?: any;
};

export type ListCredentialResponse = {
	credentials: {
		status: string;
		providerId: string;
		id: string;
		issuerDid: string;
		subjectDid: string;
		type: string | string[];
		createdAt: string;
		format: string;
		credentialStatus?: any;
	}[];
	total: number;
};
