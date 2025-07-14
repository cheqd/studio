import { VerifiableCredential } from '@veramo/core';
import type { CredentialRequest, PublishRequest, VerifyCredentialRequestBody } from './credential';
import {
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	RevocationResult,
	SuspensionResult,
	UnsuspensionResult,
} from '@cheqd/did-provider-cheqd/build/types';

// Enums
export enum DIDAccreditationTypes {
	VerifiableAuthorizationForTrustChain = 'VerifiableAuthorizationForTrustChain',
	VerifiableAccreditationToAccredit = 'VerifiableAccreditationToAccredit',
	VerifiableAccreditationToAttest = 'VerifiableAccreditationToAttest',
}

export enum AccreditationRequestType {
	authorize = 'authorize',
	accredit = 'accredit',
	attest = 'attest',
}

export type AccreditationSchemaType = {
	types: string[];
	schemaId: string;
};

export type SchemaUrlType = {
	types: string[] | string;
	url: string;
};

export type DIDAccreditationRequestBody = Omit<
	CredentialRequest,
	'attributes' | 'credentialSummary' | 'credentialSchema' | 'credentialName'
> & {
	schemas: SchemaUrlType[];
	accreditationName: string;
	attributes?: Record<string, unknown>;
	type: string[] | undefined;
	rootAuthorization?: string;
	parentAccreditation?: string;
	trustFramework?: string;
	trustFrameworkId?: string;
};

export type DIDAccreditationRequestParams = {
	accreditationType: 'authorize' | 'accredit' | 'attest';
};

export interface DIDUrlParams {
	didUrl?: string;
	did?: string;
	resourceId?: string;
	resourceName?: string;
	resourceType?: string;
}

export interface VerifyAccreditationRequestBody extends Pick<VerifyCredentialRequestBody, 'policies'>, DIDUrlParams {
	subjectDid: string;
	schemas?: SchemaUrlType[];
}

type DidUrl = Pick<VerifyAccreditationRequestBody, 'policies' | 'subjectDid' | 'schemas'> & {
	didUrl: string;
};
type DidAndResourceId = Pick<VerifyAccreditationRequestBody, 'policies' | 'subjectDid' | 'schemas'> & {
	did: string;
	resourceId: string;
};
type DidResourceNameAndType = Pick<VerifyAccreditationRequestBody, 'policies' | 'subjectDid' | 'schemas'> & {
	did: string;
	resourceName: string;
	resourceType: string;
};

export type VerifyAccreditationRequest = DidUrl | DidAndResourceId | DidResourceNameAndType;

export function isDidUrl(body: DIDUrlParams): body is DidUrl {
	return typeof body.didUrl === 'string';
}

export function isDidAndResourceId(body: DIDUrlParams): body is DidAndResourceId {
	return typeof body.did === 'string' && typeof body.resourceId === 'string';
}

export function isDidAndResourceName(body: DIDUrlParams): body is DidResourceNameAndType {
	return (
		typeof body.did === 'string' && typeof body.resourceName === 'string' && typeof body.resourceType === 'string'
	);
}

export interface VerfifiableAccreditation extends VerifiableCredential {
	credentialSubject: {
		id: string;
		accreditedFor: AccreditationSchemaType[];
	};
}

export interface RevokeAccreditationRequestBody extends DIDUrlParams {
	symmetricKey?: string;
}

export interface SuspendAccreditationRequestBody extends DIDUrlParams {
	symmetricKey?: string;
}

export interface UnsuspendAccreditationRequestBody extends DIDUrlParams {
	symmetricKey?: string;
}

export type RevokeAccreditationResponseBody = RevocationResult | BulkRevocationResult;

export type SuspendAccreditationResponseBody = SuspensionResult | BulkSuspensionResult;

export type UnsuspendAccreditationResponseBody = UnsuspensionResult | BulkUnsuspensionResult;

export type RevokeAccreditationRequestQuery = PublishRequest;

export type SuspendAccreditationRequestQuery = PublishRequest;

export type UnsuspendAccreditationRequestQuery = PublishRequest;
