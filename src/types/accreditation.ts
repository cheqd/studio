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

export type DIDAccreditationRequestBody = Omit<
	CredentialRequest,
	'attributes' | 'credentialSummary' | 'credentialSchema' | 'credentialName'
> & {
	schemas: {
		type: string;
		url: string;
	}[];
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
}

type DidUrl = Pick<VerifyAccreditationRequestBody, 'policies' | 'subjectDid'> & {
	didUrl: string;
};
type DidAndResourceId = Pick<VerifyAccreditationRequestBody, 'policies' | 'subjectDid'> & {
	did: string;
	resourceId: string;
};
type DidResourceNameAndType = Pick<VerifyAccreditationRequestBody, 'policies' | 'subjectDid'> & {
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
