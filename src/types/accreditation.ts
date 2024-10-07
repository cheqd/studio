import { VerifiableCredential } from '@veramo/core';
import type { CredentialRequest, VerifyCredentialRequestBody } from './credential';

// Enums
export enum DIDAccreditationTypes {
	VerifiableAuthorisationForTrustChain = 'VerifiableAuthorisationForTrustChain',
	VerifiableAccreditationToAccredit = 'VerifiableAccreditationToAccredit',
	VerifiableAccreditationToAttest = 'VerifiableAccreditationToAttest',
}

export enum AccreditationRequestType {
	authorize = 'authorize',
	accredit = 'accredit',
	attest = 'attest',
}

export type AccreditationSchemaType = {
	type: string;
	schemaId: string;
};

export type SchemaUrlType = {
	type: string;
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

export interface VerifyAccreditationRequestBody extends Pick<VerifyCredentialRequestBody, 'policies'> {
	didUrl?: string;
	did?: string;
	resourceId?: string;
	resourceName?: string;
	resourceType?: string;
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

export function isDidUrl(body: VerifyAccreditationRequestBody): body is DidUrl {
	return typeof body.didUrl === 'string';
}

export function isDidAndResourceId(body: VerifyAccreditationRequestBody): body is DidAndResourceId {
	return typeof body.did === 'string' && typeof body.resourceId === 'string';
}

export function isDidAndResourceName(body: VerifyAccreditationRequestBody): body is DidResourceNameAndType {
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
