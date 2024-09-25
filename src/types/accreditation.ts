import type { CredentialRequest } from './credential';

// Enums
export enum DIDAccreditationTypes {
	VerifiableAuthorisationForTrustChain = 'VerifiableAuthorisationForTrustChain',
	VerifiableAccreditationToAccredit = 'VerifiableAccreditationToAccredit',
	VerifiableAccreditationToAttest = 'VerifiableAccreditationToAttest',
}

export enum AccreditationRequestType {
	authroize = 'authorize',
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
};

export type DIDAccreditationRequestParams = {
	accreditationType: 'authorize' | 'accredit' | 'attest';
};
