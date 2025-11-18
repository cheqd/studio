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
	format: 'jsonld' | 'jwt' | 'sd-jwt-vc' | 'anoncreds';
	credentialStatus?: StatusOptions & { id?: string };
	credentialSchema?: string;
	credentialName?: string;
	credentialSummary?: string;
	termsOfUse?: AdditionalData | AdditionalData[];
	refreshService?: AdditionalData | AdditionalData[];
	evidence?: AdditionalData | AdditionalData[];
	connector?: CredentialConnectors;
	providerId?: string;
	credentialId?: string;
	category?: CredentialCategory;

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

export type RetryIssuedCredentialRequestBody = Pick<
	CredentialRequest,
	'attributes' | 'expirationDate' | 'type' | 'termsOfUse' | 'evidence' | 'refreshService' | '@context'
>;

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
	providerId?: string;
	issuerId?: string;
	subjectId?: string;
	status?: 'issued' | 'suspended' | 'revoked';
	format?: string;
	createdAt?: string;
	category?: string;
	credentialType?: string;
	network?: 'mainnet' | 'testnet';
};

export type UpdateIssuedCredentialRequestBody = {
	providerCredentialId?: string;
	status?: 'issued' | 'suspended' | 'revoked';
	providerMetadata?: Record<string, any>;
};

export type UpdateIssuedCredentialResponseBody = {
	success: boolean;
	data?: any;
	error?: string;
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

export interface GetIssuedCredentialOptions {
	includeCredential?: boolean;
	syncStatus?: boolean;
	providerId?: string;
}

export enum CredentialCategory {
	CREDENTIAL = 'credential',
	ACCREDITATION = 'accreditation',
}

export interface IssuedCredentialCreateOptions {
	providerId: string;
	providerCredentialId?: string;
	issuerId?: string;
	subjectId?: string;
	format: 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds';
	type: string[];
	status?: 'issued' | 'suspended' | 'revoked';
	statusUpdatedAt?: Date;
	issuedAt: Date;
	expiresAt?: Date;
	credentialStatus?: Record<string, any>;
	metadata?: Record<string, any>;
	category?: CredentialCategory;
	statusRegistryId?: string;
	statusIndex?: number;
	retryCount?: number;
	lastError?: string;
}

export interface IssuedCredentialResponse {
	// Tracking Information
	issuedCredentialId: string;

	// Provider Information
	providerId: string;
	providerCredentialId?: string;

	// Credential Information
	issuerId?: string;
	subjectId?: string;
	format: string;
	category?: string;
	type: string[];

	// Status Information
	status: string;
	statusUpdatedAt?: string;

	// Timestamps
	issuedAt: string;
	expiresAt?: string;

	// Credential Status Configuration
	credentialStatus?: Record<string, any>;
	statusRegistryId?: string;
	statusIndex?: number;
	retryCount?: number;
	lastError?: string;

	// Provider-specific metadata
	providerMetadata?: Record<string, any>;

	// Optional: Full credential
	credential?: VerifiableCredential;

	// Metadata
	createdAt?: string;
	updatedAt?: string;
}
