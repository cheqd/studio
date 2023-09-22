export const STORAGE_STATE_AUTHENTICATED = "playwright/.auth/user.json";
export const STORAGE_STATE_UNAUTHENTICATED = "playwright/.auth/stranger.json";

const PAYLOAD_BASE_PATH = "./tests/payloads";
export enum PAYLOADS_PATH {
	DID = `${PAYLOAD_BASE_PATH}/did`,
	RESOURCE = `${PAYLOAD_BASE_PATH}/resource`,
	CREDENTIAL = `${PAYLOAD_BASE_PATH}/credential`,
	CREDENTIAL_STATUS = `${PAYLOAD_BASE_PATH}/credential-status`
};

const GENERATED_BASE_PATH = "./tests/generated";
export enum GENERATED_PATH {
	CREDENTIAL = `${GENERATED_BASE_PATH}/credential`,
}

export enum CONTENT_TYPE {
	APPLICATION_JSON = "application/json",
	APPLICATION_DID_LD_JSON = "application/did+ld+json"
};

export const DID_METHOD = "cheqd";
export const DID_NOT_FOUND_ERROR = "notFound";

export const DEFAULT_MAINNET_DID = 'did:cheqd:mainnet:7c950b5d-dbbb-4a12-9d79-6b553ca0c271';
export const DEFAULT_TESTNET_DID = 'did:cheqd:testnet:0c3581f0-011f-4263-b1ca-15ad70d54ede';
export const DEFAULT_TESTNET_DID_IDENTIFIER = "0c3581f0-011f-4263-b1ca-15ad70d54ede";
export const DEFAULT_TESTNET_DID_RESOURCE_ID = "15e4bf65-8163-4936-91c6-c7ca81266162";

export const TESTNET_DID_WITH_IMAGE_RESOURCE = "did:cheqd:testnet:55dbc8bf-fba3-4117-855c-1e0dc1d3bb47";
export const TESTNET_DID_WITH_IMAGE_RESOURCE_ID = "3a84b9fc-2c2b-4065-86d6-58bc462284d8";

export const TESTNET_DID_FRAGMENT = "key-1";
export const TESTNET_RESOURCE = "Hello World";

export const NOT_EXISTENT_TESTNET_DID = "did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f91";
export const NOT_EXISTENT_RESOURCE_ID = "ff0a6502-03bf-422d-9a91-ad0a3755f3ff";
export const NOT_EXISTENT_STATUS_LIST_NAME = "not-exist-status-list-name";
export const NOT_EXISTENT_TESTNET_DID_IDENTIFIER = "d4a13003-0bc5-4608-b23a-54ea90fe9f91";

export const INVALID_DID = "invalid_did";

// Credential status list names
export const DEFAULT_STATUS_LIST_ENCRYPTED_NAME = 'cheqd-employee-credentials-encrypted';
export const DEFAULT_STATUS_LIST_UNENCRYPTED_NAME = 'cheqd-employee-credentials-unencrypted';
export const DEFAULT_STATUS_LIST_PAYMENT_ADDRESS = 'cheqd1qs0nhyk868c246defezhz5eymlt0dmajna2csg';
export const DEFAULT_STATUS_LIST_INDICES = [10, 3199, 12109, 130999];
export const DEFAULT_STATUS_LIST_NAME = "cheqd-employee-credentials"

// Credential names
export const DEFAULT_SUBJECT_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

// Messages
export const DEFAULT_DOES_NOT_HAVE_PERMISSIONS =
	'Unauthorized error: Your account is not authorized to carry out this action.';

export const INVALID_JWT_TOKEN = "invalid_jwt_token";