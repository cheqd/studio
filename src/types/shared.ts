import type {
	IDIDManager,
	IKeyManager,
	IDataStore,
	IResolver,
	ICredentialIssuer,
	ICredentialVerifier,
	TAgent,
	VerificationPolicies,
} from '@veramo/core';
import {
	ICheqd,
	CheqdDIDProvider,
	ICheqdCheckCredentialWithStatusList2021StatusOptions,
	DefaultStatusList2021StatusPurposeTypes,
	DefaultStatusList2021Encodings,
	CreateStatusList2021Result,
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	StatusList2021Suspension,
	StatusList2021Revocation,
	LinkedResourceMetadataResolutionResult,
	DefaultStatusList2021StatusPurposeType,
	StatusCheckResult,
} from '@cheqd/did-provider-cheqd';
import type { ICredentialIssuerLD } from '@veramo/credential-ld';
import type { AbstractIdentifierProvider } from '@veramo/did-manager';
import type { AbstractKeyManagementSystem } from '@veramo/key-manager';
import type { DataSource } from 'typeorm';
import { CheqdNetwork, MethodSpecificIdAlgo, Service, VerificationMethods } from '@cheqd/sdk';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2';
import type { DIDDocument } from 'did-resolver';
import type { CustomerEntity } from '../database/entities/customer.entity';
import type { UserEntity } from '../database/entities/user.entity';
import type { IReturn } from '../middleware/auth/routine.js';
import type { ICommonErrorResponse } from './authentication.js';
import { StatusCodes } from 'http-status-codes';

const DefaultUuidPattern = '([a-zA-Z0-9-]{36})';
const DefaultMethodSpecificIdPattern = `(?:[a-zA-Z0-9]{21,22}|${DefaultUuidPattern})`;
const DefaultNamespacePattern = `(${CheqdNetwork.Mainnet}|${CheqdNetwork.Testnet})`;

export const DefaultDidUrlPattern = new RegExp(
	`^did:cheqd:${DefaultNamespacePattern}:${DefaultMethodSpecificIdPattern}$`
);
export const DefaultNetworkPattern = new RegExp(`did:cheqd:${DefaultNamespacePattern}:.*`);

export const DefaultStatusActions = {
	revoke: 'revoke',
	suspend: 'suspend',
	reinstate: 'reinstate',
} as const;

export const DefaultStatusActionPurposeMap = {
	[DefaultStatusActions.revoke]: DefaultStatusList2021StatusPurposeTypes.revocation,
	[DefaultStatusActions.suspend]: DefaultStatusList2021StatusPurposeTypes.suspension,
	[DefaultStatusActions.reinstate]: DefaultStatusList2021StatusPurposeTypes.suspension,
} as const;

export type DefaultStatusAction = keyof typeof DefaultStatusActions;

export type MinimalPaymentCondition = {
	feePaymentAddress: string;
	feePaymentAmount: number; // in CHEQ, decimals are allowed, strictly up to 2 decimal points, e.g. 1.5 CHEQ, 1.55 CHEQ
	feePaymentWindow: number; // in minutes, strictly integer, e.g. 5 minutes, 10 minutes
};

export type CreateDidRequestBody = {
	didDocument?: DIDDocument;
	identifierFormatType: MethodSpecificIdAlgo;
	network: CheqdNetwork;
	verificationMethodType?: VerificationMethods;
	service?: Service | Service[];
	'@context'?: string | string[];
	key?: string;
	options?: {
		verificationMethodType: VerificationMethods;
		key: string;
	};
};

export type CreateUnencryptedStatusListRequestBody = {
	did: string;
	statusListName: string;
	statusListVersion?: string;
	alsoKnownAs?: AlternativeUri[];
	length?: number;
	encoding?: keyof typeof DefaultStatusList2021Encodings;
	encodedList?: string;
};

export type CreateUnencryptedStatusListRequestQuery = {
	statusPurpose: DefaultStatusList2021StatusPurposeType;
};

export type CreateUnencryptedStatusListSuccessfulResponseBody = Pick<
	CreateStatusList2021Result,
	'created' | 'error' | 'resource' | 'resourceMetadata'
>;

export type CreateUnencryptedStatusListUnsuccessfulResponseBody = {
	created: false;
	error: string;
};

export type CreateEncryptedStatusListRequestBody = CreateUnencryptedStatusListRequestBody & {
	paymentConditions?: MinimalPaymentCondition[];
	feePaymentAddress?: MinimalPaymentCondition['feePaymentAddress'];
	feePaymentAmount?: MinimalPaymentCondition['feePaymentAmount'];
	feePaymentWindow?: MinimalPaymentCondition['feePaymentWindow'];
};

export type CreateEncryptedStatusListRequestQuery = CreateUnencryptedStatusListRequestQuery;

export type CreateEncryptedStatusListSuccessfulResponseBody = Pick<
	CreateStatusList2021Result,
	'created' | 'error' | 'resource' | 'resourceMetadata' | 'symmetricKey'
>;

export type CreateEncryptedStatusListUnsuccessfulResponseBody = CreateUnencryptedStatusListUnsuccessfulResponseBody;

export type UpdateUnencryptedStatusListRequestBody = {
	did: string;
	indices: number | number[];
	statusListName: string;
	statusListVersion?: string;
};

export type UpdateUnencryptedStatusListRequestQuery = {
	statusAction: DefaultStatusAction;
};

export type UpdateUnencryptedStatusListSuccessfulResponseBody = {
	updated: true;
} & Pick<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult, 'error' | 'resourceMetadata'> & {
		revoked?: BulkRevocationResult['revoked'];
		suspended?: BulkSuspensionResult['suspended'];
		unsuspended?: BulkUnsuspensionResult['unsuspended'];
		resource?:
			| BulkRevocationResult['statusList']
			| BulkSuspensionResult['statusList']
			| BulkUnsuspensionResult['statusList'];
	};

export type UpdateUnencryptedStatusListUnsuccessfulResponseBody = {
	updated: false;
	error: string;
	revoked?: BulkRevocationResult['revoked'];
	suspended?: BulkSuspensionResult['suspended'];
	unsuspended?: BulkUnsuspensionResult['unsuspended'];
};

export type UpdateEncryptedStatusListRequestBody = UpdateUnencryptedStatusListRequestBody & {
	symmetricKey: string;
	paymentConditions?: MinimalPaymentCondition[];
	feePaymentAddress?: MinimalPaymentCondition['feePaymentAddress'];
	feePaymentAmount?: MinimalPaymentCondition['feePaymentAmount'];
	feePaymentWindow?: MinimalPaymentCondition['feePaymentWindow'];
};

export type UpdateEncryptedStatusListRequestQuery = UpdateUnencryptedStatusListRequestQuery;

export type UpdateEncryptedStatusListSuccessfulResponseBody = {
	updated: true;
} & Pick<
	BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult,
	'error' | 'resourceMetadata' | 'symmetricKey'
> & {
		revoked?: BulkRevocationResult['revoked'];
		suspended?: BulkSuspensionResult['suspended'];
		unsuspended?: BulkUnsuspensionResult['unsuspended'];
		resource?:
			| BulkRevocationResult['statusList']
			| BulkSuspensionResult['statusList']
			| BulkUnsuspensionResult['statusList'];
	};

export type UpdateEncryptedStatusListUnsuccessfulResponseBody = UpdateUnencryptedStatusListUnsuccessfulResponseBody;

export type CheckStatusListRequestBody = {
	did: string;
	statusListName: string;
	index: number;
	makeFeePayment?: boolean;
};

export type CheckStatusListRequestQuery = {
	statusPurpose: DefaultStatusList2021StatusPurposeType;
};

export type CheckStatusListSuccessfulResponseBody = {
	checked: true;
} & Pick<StatusCheckResult, 'error' | 'revoked' | 'suspended'>;

export type CheckStatusListUnsuccessfulResponseBody = {
	checked: false;
	error: string;
};

export type VerifyPresentationResponseBody = {
	verified: false;
	error: string;
};

export type SearchStatusListQuery = {
	did: string;
	statusListName: string;
	statusPurpose: DefaultStatusList2021StatusPurposeType;
};

export type SearchStatusListSuccessfulResponseBody = Required<
	Pick<SearchStatusListResult, 'resource' | 'resourceMetadata'>
> & {
	found: true;
};

export type SearchStatusListUnsuccessfulResponseBody = {
	found: false;
	error: string;
};

export type ErrorResponse = {
	name: string;
	message: string;
	stack?: string;
	status: number;
};

export interface IHash {
	[details: string]: string;
}

export type DateType = string | Date;

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

export type CreateDIDService = {
	idFragment: string;
	type: string;
	serviceEndpoint: string[];
};

export type JwtProof2020 = {
	type: string;
	jwt: string;
};

export type JSONLDProofType = {
	type: string;
	created: string;
	verificationMethod: string;
	proofPurpose: string;
	jws: string;
};

export type CheqdCredentialStatus = {
	id: string;
	type: string;
	statusPurpose: string;
	statusListIndex: string;
};

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
	statusPurpose: DefaultStatusList2021StatusPurposeType;
};

export type CreateEncryptedStatusListOptions = CreateUnencryptedStatusListOptions & {
	paymentConditions?: MinimalPaymentCondition[];
	feePaymentAddress?: MinimalPaymentCondition['feePaymentAddress'];
	feePaymentAmount?: MinimalPaymentCondition['feePaymentAmount'];
	feePaymentWindow?: MinimalPaymentCondition['feePaymentWindow'];
};

export type UpdateUnencryptedStatusListOptions = {
	indices: number[];
	statusListName: string;
	statusListVersion?: string;
	statusAction: DefaultStatusAction;
};

export type UpdateEncryptedStatusListOptions = UpdateUnencryptedStatusListOptions & {
	symmetricKey: string;
	paymentConditions?: MinimalPaymentCondition[];
	feePaymentAddress?: MinimalPaymentCondition['feePaymentAddress'];
	feePaymentAmount?: MinimalPaymentCondition['feePaymentAmount'];
	feePaymentWindow?: MinimalPaymentCondition['feePaymentWindow'];
};

export type SearchStatusListResult = {
	found: boolean;
	error?: string;
	resource?: StatusList2021Revocation | StatusList2021Suspension;
	resourceMetadata?: LinkedResourceMetadataResolutionResult;
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

export type FeePaymentOptions = {
	feePaymentAddress: string;
	feePaymentAmount: string;
	feePaymentNetwork: CheqdNetwork;
	memo?: string;
};

export type CheckStatusListOptions = Omit<ICheqdCheckCredentialWithStatusList2021StatusOptions, 'issuerDid'>;

export interface VerificationOptions {
	fetchRemoteContexts?: boolean;
	policies?: VerificationPolicies;
	domain?: string;
	verifyStatus?: boolean;
}

export type TrackData = IResourceTrack;

export interface ITrackOperation {
	// function name, e.g. createDid, issueCredential, etc.
	operation: string;
	// category of the operation, e.g. did, resource, credential, credential-status
	category: string;
	// data of the operation, e.g. did, resource, credentialStatus
	data: TrackData;
	// customer who initiated the operation (like organistation)
	customer: CustomerEntity;
	// user who initiated the operation
	user?: UserEntity;
	// identifier
	did?: string;
	// controller's key
	key?: string;
	// fee payment options
	feePaymentOptions?: {
		feePaymentAddress: string;
		feePaymentAmount: number;
		feePaymentNetwork: CheqdNetwork;
	};
}

export interface IResourceTrack {
	resource: LinkedResourceMetadataResolutionResult;
	encrypted: boolean;
	symmetricKey: string;
}

export interface ITrackResult {
	created: boolean;
	error?: string;
}

export interface IErrorResponse {
	errorCode: string;
	message: string;
}

export class CommonReturn implements IReturn {
	returnOk(data = {}): ICommonErrorResponse {
		return {
			status: StatusCodes.OK,
			error: '',
			data: data,
		};
	}

	returnError(status: number, error: string, data = {}): ICommonErrorResponse {
		return {
			status: status,
			error: error,
			data: data,
		};
	}
}
