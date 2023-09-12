export const STORAGE_STATE_FILE_PATH = "playwright/.auth/user.json";

const PAYLOAD_BASE_PATH = "./tests/payloads";
export enum PAYLOADS_PATH {
	DID = `${PAYLOAD_BASE_PATH}/did`,
	RESOURCE = `${PAYLOAD_BASE_PATH}/resource`,
	CREDENTIAL = `${PAYLOAD_BASE_PATH}/credential`,
	CREDENTIAL_STATUS = `${PAYLOAD_BASE_PATH}/credential-status`
};

export enum CONTENT_TYPE {
	APPLICATION_JSON = "application/json",
	APPLICATION_DID_LD_JSON = "application/did+ld+json"
};

export const DID_METHOD = "cheqd";

export const DEFAULT_MAINNET_DID = 'did:cheqd:mainnet:7c950b5d-dbbb-4a12-9d79-6b553ca0c271';
export const DEFAULT_TESTNET_DID = 'did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0';

export const TESTNET_DID = "did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f90";
export const TESTNET_DID_FRAGMENT = "key-1";
export const TESTNET_DID_CREATED_TIME = "2023-09-07T10:22:40Z";
export const TESTNET_DID_IDENTIFIER = "d4a13003-0bc5-4608-b23a-54ea90fe9f90";
export const TESTNET_DID_RESOURCE_ID = "cc0a6502-03bf-422d-9a91-ad0a3755f302";
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

// Credential names
export const DEFAULT_SUBJECT_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

// Messages
export const DEFAULT_DOES_NOT_HAVE_PERMISSIONS =
	'Unauthorized error: Your account is not authorized to carry out this action.';

export const VALID_JWT_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZyIsImh0dHBzOi8vdmVyYW1vLmlvL2NvbnRleHRzL3Byb2ZpbGUvdjEiLCJodHRwczovL3czaWQub3JnL3ZjLXN0YXR1cy1saXN0LTIwMjEvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlBlcnNvbiJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJnZW5kZXIiOiJtYWxlIiwibmFtZSI6IkJvYiJ9LCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly9yZXNvbHZlci5jaGVxZC5uZXQvMS4wL2lkZW50aWZpZXJzL2RpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MD9yZXNvdXJjZU5hbWU9Y2hlcWQtZW1wbG95ZWUtY3JlZGVudGlhbHMmcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxUmV2b2NhdGlvbiMxMCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InJldm9jYXRpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE2OTQwODIyMDEsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MCJ9.AsW39Jej_Qae2FbpVdzyUhhuTi9gVWTx9w5NEyUfJYM6gQuCSAigiwcmaZZrcBWjOm53NXi-jRP561BpdVuSBw";
export const VALID_CREDENTIAL = {
	credentialSubject: {
		gender: "male",
		name: "Bob",
		id: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
	},
	issuer: {
		id: "did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f90"
	},
	type: [
		"VerifiableCredential",
		"Person"
	],
	credentialStatus: {
		id: "https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f90?resourceName=cheqd-employee-credentials&resourceType=StatusList2021Revocation#10",
		type: "StatusList2021Entry",
		statusPurpose: "revocation",
		statusListIndex: "10"
	},
	"@context": [
		"https://www.w3.org/2018/credentials/v1",
		"https://schema.org",
		"https://veramo.io/contexts/profile/v1",
		"https://w3id.org/vc-status-list-2021/v1"
	],
	issuanceDate: "2023-09-07T10:23:21.000Z",
	proof: {
		type: "JwtProof2020",
		jwt: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZyIsImh0dHBzOi8vdmVyYW1vLmlvL2NvbnRleHRzL3Byb2ZpbGUvdjEiLCJodHRwczovL3czaWQub3JnL3ZjLXN0YXR1cy1saXN0LTIwMjEvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlBlcnNvbiJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJnZW5kZXIiOiJtYWxlIiwibmFtZSI6IkJvYiJ9LCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly9yZXNvbHZlci5jaGVxZC5uZXQvMS4wL2lkZW50aWZpZXJzL2RpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MD9yZXNvdXJjZU5hbWU9Y2hlcWQtZW1wbG95ZWUtY3JlZGVudGlhbHMmcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxUmV2b2NhdGlvbiMxMCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InJldm9jYXRpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE2OTQwODIyMDEsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MCJ9.AsW39Jej_Qae2FbpVdzyUhhuTi9gVWTx9w5NEyUfJYM6gQuCSAigiwcmaZZrcBWjOm53NXi-jRP561BpdVuSBw"
	}
};

export const NOT_MATCHED_CREDENTIAL_AND_JWT = {
	"@context": [
		"https://www.w3.org/2018/credentials/v1",
		"https://schema.org",
		"https://veramo.io/contexts/profile/v1"
	],
	credentialSubject: {
		gender: "male",
		id: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
		name: "Bob"
	},
	credentialStatus: {
		id: "https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20",
		statusIndex: 20,
		statusPurpose: "suspension",
		type: "StatusList2021Entry"
	},
	issuanceDate: "2023-06-08T13:49:28.000Z",
	issuer: {
		id: "did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0"
	},
	proof: {
		jwt: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo3YmY4MWEyMC02MzNjLTRjYzctYmM0YS01YTQ1ODAxMDA1ZTAiLCJuYmYiOjE2ODYyMzIxNjgsInN1YiI6ImRpZDprZXk6ejZNa2hhWGdCWkR2b3REa0w1MjU3ZmFpenRpR2lDMlF0S0xHcGJubkVHdGEyZG9LIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3NjaGVtYS5vcmciLCJodHRwczovL3ZlcmFtby5pby9jb250ZXh0cy9wcm9maWxlL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImdlbmRlciI6Im1hbGUiLCJuYW1lIjoiQm9iIn0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJQZXJzb24iXX19.wMfdR6RtyAZA4eoWya5Aw97wwER2Cm5Guk780Xw8H9fA3sfudIJeLRLboqixpTchqSbYeA7KbuCTAnLgXTD_Cg",
		type: "JwtProof2020"
	},
	type: [
		"VerifiableCredential",
		"Person"
	]
};

export const INVALID_JWT_TOKEN = "invalid_jwt_token";
export const INVALID_CREDENTIAL = {
	issuer: {
		id: "did:cheqd:testnet:invalid_id"
	},
	type: [
		"VerifiableCredential",
		"Person"
	],
	credentialStatus: {
		id: "https://resolver.cheqd.net/1.0/identifiers/invalid_id?resourceName=cheqd-employee-credentials&resourceType=StatusList2021Revocation#10",
		type: "StatusList2021Entry",
		statusPurpose: "revocation",
		statusListIndex: "10"
	},
	"@context": [
		"https://www.w3.org/2018/credentials/v1",
		"https://schema.org",
		"https://veramo.io/contexts/profile/v1",
		"https://w3id.org/vc-status-list-2021/v1"
	],
	issuanceDate: "2023-09-07T10:23:21.000Z",
	proof: {
		type: "JwtProof2020",
		jwt: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZyIsImh0dHBzOi8vdmVyYW1vLmlvL2NvbnRleHRzL3Byb2ZpbGUvdjEiLCJodHRwczovL3czaWQub3JnL3ZjLXN0YXR1cy1saXN0LTIwMjEvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlBlcnNvbiJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJnZW5kZXIiOiJtYWxlIiwibmFtZSI6IkJvYiJ9LCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly9yZXNvbHZlci5jaGVxZC5uZXQvMS4wL2lkZW50aWZpZXJzL2RpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MD9yZXNvdXJjZU5hbWU9Y2hlcWQtZW1wbG95ZWUtY3JlZGVudGlhbHMmcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxUmV2b2NhdGlvbiMxMCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InJldm9jYXRpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE2OTQwODIyMDEsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MCJ9.AsW39Jej_Qae2FbpVdzyUhhuTi9gVWTx9w5NEyUfJYM6gQuCSAigiwcmaZZrcBWjOm53NXi-jRP561BpdVuSBw"
	}
};
