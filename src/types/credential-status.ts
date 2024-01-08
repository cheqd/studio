import {
	DefaultStatusList2021Encodings,
	CreateStatusList2021Result,
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	DefaultStatusList2021StatusPurposeType,
	StatusCheckResult,
	LinkedResourceMetadataResolutionResult,
	StatusList2021Revocation,
	StatusList2021Suspension,
	ICheqdCheckCredentialWithStatusList2021StatusOptions,
	DefaultStatusList2021StatusPurposeTypes,
} from '@cheqd/did-provider-cheqd';
import type { CheqdNetwork } from '@cheqd/sdk';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2';

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
export type CheckStatusListOptions = Omit<ICheqdCheckCredentialWithStatusList2021StatusOptions, 'issuerDid'>;
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
export type FeePaymentOptions = {
	feePaymentAddress: string;
	feePaymentAmount: string;
	feePaymentNetwork: CheqdNetwork;
	memo?: string;
};
