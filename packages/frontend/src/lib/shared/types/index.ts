import type { BaseCredentialListType } from './credential.types';
import type { CredentialType } from './credential.types';

export * from './discord.types';
export * from './voucher.types';
export * from './credential.types';
export * from './presentation.types';
export * from './share.types';
export * from './achievement.types';
export * from './ticket.types';
export * from './event.types';
export * from './learn.types';
export * from './communityRole.types';
export * from './endorsement.types';
export * from './server.types';
export * from './rendering.types';
export * from './storage.types';

export type WaltIdCredentialIssuanceRequest = {
	walletId: string;
	tenantId: string;
	credentials: Record<string, unknown> | unknown[];
};

export type CheqdCredentialIssuanceRequest = {
	walletId: string;
	tenantId: string;
	credentials: CredentialType[];
};

export type UserCustomData = {
	credentialsEncryptedStorageLink: string;
	credentials: CredentialMeta[];
	did?: string;
	clientKeys?: {
		publicKey?: string;
	}
};

export type CustomDataRequest = {
	customData: UserCustomData;
};

export type AuthenticationTokenResponse = {
	access_token: string;
	expires_in: number;
	token_type: string;
	scope: string;
};

export type CredentialMeta = {
	id: string;
	type: string;
	voucherId: string;
	status: string;
	importedAt?: Date;
	issuedAt?: Date;
};

export type LogtoApiError = {
	error: string;
	error_description: string;
};

export type LogtoApiResponse<T> = LogtoApiError & {
	data: T;
};

export type LogToIdentity = {
	userId: string;
	details?: Record<string, unknown>;
};

export type Fetch = typeof fetch;

// TODO: migrate this to zod schema + type inference
export type CredentialPresentationRequest = {
	credentialType: string[];
	credentialIDs: string[];
};

// TODO: migrate this to zod schema + type inference
export type PresentationResult = {
	isValid?: boolean;
	state?: string;
	subject?: string;
	auth_token?: string;
	vps?: [VPs];
	url?: string;
} & APIError;

type VPs = {
	vcs: BaseCredentialListType;
	verification_result: VerificationPolicyResult;
	vp: VerifiablePresentation;
};

// TODO: migrate this to zod schema + type inference
type VerifiablePresentation = {
	type: [string];
	'@context': [string];
	id: string;
	holder: string;
	verifiableCredential: [string];
};

// TODO: migrate this to zod schema + type inference
export type VerificationPolicyResult = {
	policyResults: {
		SignaturePolicy: boolean;
		ChallengePolicy: boolean;
		PresentationDefinitionPolicy: boolean;
	};
	valid: boolean;
};

// TODO: migrate this to zod schema + type inference
export type APIError = {
	error?: string;
};

// TODO: migrate this to zod schema + type inference
export type IssuerConfigResponse = {
	issuers: {
		issuerApiUrl: string;
		issuerClientName: string;
		issuerDid: string;
		issuerUiUrl: string;
		wallets: {
			acme: {
				description: string;
				id: string;
				presentPath: string;
				receivePath: string;
				url: string;
			};
		};
	};
};
