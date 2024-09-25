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

export type DIDAccreditationRequestBody = Omit<CredentialRequest, 'attributes'> & {
	schemas: {
		type: string;
		url: string;
	}[];
	attributes?: Record<string, unknown>;
};

export type DIDAccreditationRequestParams = {
	accreditationType: 'authorize' | 'accredit' | 'attest';
};
