import type {
	IDIDManager,
	IKeyManager,
	IDataStore,
	IResolver,
	ICredentialIssuer,
	ICredentialVerifier,
	W3CVerifiableCredential,
	TAgent,
	VerificationPolicies,
} from '@veramo/core';
import type {
	ICheqd,
	CheqdDIDProvider,
	ICheqdCheckCredentialWithStatusList2021StatusOptions,
	DefaultStatusList2021StatusPurposeTypes,
	DefaultStatusList2021Encodings,
} from '@cheqd/did-provider-cheqd';
import type { ICredentialIssuerLD } from '@veramo/credential-ld';
import type { AbstractIdentifierProvider } from '@veramo/did-manager';
import type { AbstractKeyManagementSystem } from '@veramo/key-manager';
import type { DataSource } from 'typeorm';
import { CheqdNetwork } from '@cheqd/sdk';

const DefaultUuidPattern = '([a-zA-Z0-9-]{36})';
const DefaultMethodSpecificIdPattern = `(?:[a-zA-Z0-9]{21,22}|${DefaultUuidPattern})`;
const DefaultNamespacePattern = `(${CheqdNetwork.Mainnet}|${CheqdNetwork.Testnet})`;

export const DefaultDidUrlPattern = new RegExp(`^did:cheqd:${DefaultNamespacePattern}:${DefaultMethodSpecificIdPattern}$`);

export const DefaultStatusActions = {
	revoke: 'revoke',
	suspend: 'suspend',
	reinstate: 'reinstate',
} as const;

export type DefaultStatusAction = keyof typeof DefaultStatusActions;

export type MinimalPaymentCondition = {
	feePaymentAddress: string;
	feePaymentAmount: number; // in CHEQ, decimals are allowed, strictly up to 2 decimal points, e.g. 1.5 CHEQ, 1.55 CHEQ
	feePaymentWindow: number; // in minutes, strictly integer, e.g. 5 minutes, 10 minutes
}

export type ErrorResponse = {
	name: string;
	message: string;
	stack?: string;
	status: number;
};

export interface IHash {
	[details: string]: string;
}

export type CompactJWT = string;

export type DateType = string | Date;

export interface PresentationPayload {
	holder: string;
	verifiableCredential?: W3CVerifiableCredential[];
	type?: string[];
	'@context'?: string[];
	verifier?: string[];
	issuanceDate?: DateType;
	expirationDate?: DateType;
	id?: string;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[x: string]: any;
}

export type GenericAuthResponse = {
	authenticated: boolean;
	user: GenericAuthUser;
	provider: string;
	error?: unknown;
};

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

export type GenericAuthUser = Record<string, unknown> | null | undefined;

export type SpecValidationResult = {
	valid: boolean;
	error?: string;
};

export type VeramoAgent = TAgent<
	IDIDManager &
		IKeyManager &
		IDataStore &
		IResolver &
		ICredentialIssuer &
		ICredentialVerifier &
		ICheqd &
		ICredentialIssuerLD
>;

export type CreateAgentRequest = {
	providers?: Record<string, AbstractIdentifierProvider>;
	kms?: Record<string, AbstractKeyManagementSystem>;
	dbConnection: DataSource;
	cheqdProviders?: CheqdDIDProvider[];
	enableResolver?: boolean;
	enableCredential?: boolean;
};

export type CreateUnencryptedStatusListOptions = {
	length?: number;
	encoding?: keyof typeof DefaultStatusList2021Encodings;
	statusPurpose: keyof typeof DefaultStatusList2021StatusPurposeTypes;
};

export type CreateEncryptedStatusListOptions = CreateUnencryptedStatusListOptions & {
	paymentConditions?: MinimalPaymentCondition[];
	feePaymentAddress?: MinimalPaymentCondition['feePaymentAddress'];
	feePaymentAmount?: MinimalPaymentCondition['feePaymentAmount'];
	feePaymentWindow?: MinimalPaymentCondition['feePaymentWindow'];
}

export type UpdateUnencryptedStatusListOptions = {
	indices: number[];
	statusListName: string;
	statusListVersion?: string;
	statusAction: DefaultStatusAction;
}

export type UpdateEncryptedStatusListOptions = UpdateUnencryptedStatusListOptions & {
	symmetricKey: string;
	paymentConditions?: MinimalPaymentCondition[];
	feePaymentAddress?: MinimalPaymentCondition['feePaymentAddress'];
	feePaymentAmount?: MinimalPaymentCondition['feePaymentAmount'];
	feePaymentWindow?: MinimalPaymentCondition['feePaymentWindow'];
};

export type BroadcastStatusListOptions = Omit<CreateUnencryptedStatusListOptions, 'length'>;

export type StatusOptions = {
	statusPurpose: CreateUnencryptedStatusListOptions['statusPurpose'];
	statusListName: string;
	statusListIndex?: number;
	statusListVersion?: string;
	statusListRangeStart?: number;
	statusListRangeEnd?: number;
	indexNotIn?: number[];
};

export type RevocationStatusOptions = StatusOptions & { statusPurpose: 'revocation' };
export type SuspensionStatusOptions = StatusOptions & { statusPurpose: 'suspension' };

export interface ResourceMetadata {
	collectionId: string;
	resourceId: string;
	resourceName: string;
	resourceVersion: string;
	resourceType: string;
	mediaType: string;
	created?: Date;
	checksum: string;
	previousVersionId: string;
	nextVersionId: string;
}

export type CheckStatusListOptions = Omit<ICheqdCheckCredentialWithStatusList2021StatusOptions, 'issuerDid'>;

export interface VerificationOptions {
	fetchRemoteContexts?: boolean;
	policies?: VerificationPolicies;
	domain?: string;
	verifyStatus?: boolean;
}
