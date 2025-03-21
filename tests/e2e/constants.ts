export const STORAGE_STATE_AUTHENTICATED = 'playwright/.auth/user.json';
export const STORAGE_STATE_UNAUTHENTICATED = 'playwright/.auth/stranger.json';

const PAYLOAD_BASE_PATH = './tests/e2e/payloads';
export enum PAYLOADS_PATH {
	DID = `${PAYLOAD_BASE_PATH}/did`,
	RESOURCE = `${PAYLOAD_BASE_PATH}/resource`,
	CREDENTIAL = `${PAYLOAD_BASE_PATH}/credential`,
	CREDENTIAL_STATUS = `${PAYLOAD_BASE_PATH}/credential-status`,
	PRESENTATION = `${PAYLOAD_BASE_PATH}/presentation`,
	ACCREDITATION = `${PAYLOAD_BASE_PATH}/accreditation`,
}

const GENERATED_BASE_PATH = './tests/e2e/generated';
export enum GENERATED_PATH {
	CREDENTIAL = `${GENERATED_BASE_PATH}/credential`,
}

export enum CONTENT_TYPE {
	APPLICATION_JSON = 'application/json',
	APPLICATION_LD_JSON = 'application/ld+json',
	APPLICATION_DID = 'application/did',
	APPLICATION_DID_LD_JSON = 'application/did+ld+json',
	APPLICATION_X_WWW_FORM_URLENCODED = 'application/x-www-form-urlencoded',
}

export const DID_METHOD = 'cheqd';
export const DID_NOT_FOUND_ERROR = 'notFound';

// todo: create a new mainnet did from test account
export const DEFAULT_MAINNET_DID = 'did:cheqd:mainnet:a6ef1d50-a040-4db3-b833-6bb3a0ff1eb6';
export const DEFAULT_TESTNET_DID = 'did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA';
export const DEFAULT_TESTNET_DID_IDENTIFIER = '5RpEg66jhhbmASWPXJRWrA';

export const DEACTIVATED_TESTNET_DID = 'did:cheqd:testnet:UYBzUsTPHpTEXSnzYGTzUZ';

export const TESTNET_DID_WITH_JSON_RESOURCE = 'did:cheqd:testnet:c69d7867-be90-4dea-8bbf-f4419d3599d8';
export const TESTNET_DID_WITH_JSON_RESOURCE_ID = '3194b5a6-1b73-44a0-8ccf-27dc01509eb2';

export const TESTNET_DID_WITH_IMAGE_RESOURCE = 'did:cheqd:testnet:55dbc8bf-fba3-4117-855c-1e0dc1d3bb47';
export const TESTNET_DID_WITH_IMAGE_RESOURCE_ID = '3a84b9fc-2c2b-4065-86d6-58bc462284d8';

export const TESTNET_DID_FRAGMENT = 'key-1';
export const TESTNET_RESOURCE_JSON = '{"data": "Hello World"}';

export const NOT_EXISTENT_TESTNET_DID = 'did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f91';
export const NOT_EXISTENT_RESOURCE_ID = 'ff0a6502-03bf-422d-9a91-ad0a3755f3ff';
export const NOT_EXISTENT_STATUS_LIST_NAME = 'not-exist-status-list-name';
export const NOT_EXISTENT_TESTNET_DID_IDENTIFIER = 'd4a13003-0bc5-4608-b23a-54ea90fe9f91';

// Credential status list names
export const DEFAULT_STATUS_LIST_ENCRYPTED_NAME = 'cheqd-employee-credentials-encrypted';
export const DEFAULT_STATUS_LIST_UNENCRYPTED_NAME = 'testingStatusList';
export const DEFAULT_STATUS_LIST_PAYMENT_ADDRESS = 'cheqd1qs0nhyk868c246defezhz5eymlt0dmajna2csg';
export const DEFAULT_STATUS_LIST_INDICES = [10, 3199, 12109, 130999];

// Credential names
export const DEFAULT_SUBJECT_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

// Messages
export const DEFAULT_DOES_NOT_HAVE_PERMISSIONS =
	'Unauthorized error: Your account is not authorized to carry out this action.';

export const INVALID_JWT_TOKEN = 'invalid_jwt_token';
export const DEFAULT_CONTEXT = 'https://www.w3.org/ns/did/v1';

export const NOT_EXISTENT_KEY = '88888888888895e01f3d98fcec8ccc7861a030b317d4326b0e48a88888888888';
export const NOT_SUPPORTED_VERIFICATION_METHOD_TYPE = 'not_supported_vm_type';

export const INVALID_ID = 'invalid_id';
export const INVALID_DID = 'invalid_did';

export enum ID_TYPE {
	UUID = 'uuid',
	BASE58BTC = 'base58btc',
}
