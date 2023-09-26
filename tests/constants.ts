export const DEFAULT_MAINNET_DID = 'did:cheqd:mainnet:7c950b5d-dbbb-4a12-9d79-6b553ca0c271';
export const DEFAULT_TESTNET_DID = 'did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0';

// Credential status list names
export const DEFAULT_STATUS_LIST_ENCRYPTED_NAME = 'cheqd-employee-credentials-encrypted';
export const DEFAULT_STATUS_LIST_UNENCRYPTED_NAME = 'cheqd-employee-credentials-unencrypted';
export const DEFAULT_STATUS_LIST_PAYMENT_ADDRESS = 'cheqd1qs0nhyk868c246defezhz5eymlt0dmajna2csg';
export const DEFAULT_STATUS_LIST_INDICES = [10, 3199, 12109, 130999];

// Credential names
export const DEFAULT_SUBJECT_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

// Messages
export const DEFAULT_DOES_NOT_HAVE_PERMISSIONS =
	'Unauthorized error: Your account is not authorized to carry out this action.';

export const DEFAULT_CONTEXT="https://www.w3.org/ns/did/v1"

export enum NETWORK {
	MAINNET = "mainnet",
	TESTNET = "testnet"
};

export enum ID_TYPE {
	UUID = "uuid",
	BASE58BTC = "base58btc"
};

export enum VERIFICATION_METHOD_TYPES {
	Ed25519VerificationKey2018 = "Ed25519VerificationKey2018",
	Ed25519VerificationKey2020 = "Ed25519VerificationKey2020",
	JsonWebKey2020 = "JsonWebKey2020"
};
