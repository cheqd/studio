export const TESTNET_DID = "did:cheqd:testnet:c1685ca0-1f5b-439c-8eb8-5c0e85ab7cd0";
export const TESTNET_RESOURCE_ID = "9ba3922e-d5f5-4f53-b265-fc0d4e988c77"

export const TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST="did:cheqd:testnet:5ad93129-0d5c-48da-8ea6-29f21379bc8e"
export const TESTNET_DID_WITH_ENCRYPTED_STATUS_LIST="did:cheqd:testnet:78941686-21ae-4770-9a1a-64849d55929a"

export const TESTNET_DID_FRAGMENT = "key-1";

export const VALID_JWT_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo3YmY4MWEyMC02MzNjLTRjYzctYmM0YS01YTQ1ODAxMDA1ZTAiLCJuYmYiOjE2ODYyMzIxNjgsInN1YiI6ImRpZDprZXk6ejZNa2hhWGdCWkR2b3REa0w1MjU3ZmFpenRpR2lDMlF0S0xHcGJubkVHdGEyZG9LIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3NjaGVtYS5vcmciLCJodHRwczovL3ZlcmFtby5pby9jb250ZXh0cy9wcm9maWxlL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImdlbmRlciI6Im1hbGUiLCJuYW1lIjoiQm9iIn0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJQZXJzb24iXX19.wMfdR6RtyAZA4eoWya5Aw97wwER2Cm5Guk780Xw8H9fA3sfudIJeLRLboqixpTchqSbYeA7KbuCTAnLgXTD_Cg"
export const VALID_CREDENTIAL = {
    credentialSubject: {
        gender: "male",
        name: "Bob",
        id: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
    },
    issuer: {
        id: "did:cheqd:testnet:78941686-21ae-4770-9a1a-64849d55929a"
    },
    type: [
        "VerifiableCredential",
        "Person"
    ],
    credentialStatus: {
        id: "https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:78941686-21ae-4770-9a1a-64849d55929a?resourceName=employee-credentials&resourceType=StatusList2021Revocation#10",
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
    issuanceDate: "2023-09-04T07:21:22.000Z",
    proof: {
        type: "JwtProof2020",
        jwt: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZyIsImh0dHBzOi8vdmVyYW1vLmlvL2NvbnRleHRzL3Byb2ZpbGUvdjEiLCJodHRwczovL3czaWQub3JnL3ZjLXN0YXR1cy1saXN0LTIwMjEvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlBlcnNvbiJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJnZW5kZXIiOiJtYWxlIiwibmFtZSI6IkJvYiJ9LCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly9yZXNvbHZlci5jaGVxZC5uZXQvMS4wL2lkZW50aWZpZXJzL2RpZDpjaGVxZDp0ZXN0bmV0Ojc4OTQxNjg2LTIxYWUtNDc3MC05YTFhLTY0ODQ5ZDU1OTI5YT9yZXNvdXJjZU5hbWU9ZW1wbG95ZWUtY3JlZGVudGlhbHMmcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxUmV2b2NhdGlvbiMxMCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InJldm9jYXRpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE2OTM4MTIwODIsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0Ojc4OTQxNjg2LTIxYWUtNDc3MC05YTFhLTY0ODQ5ZDU1OTI5YSJ9.cwlwpL63TAX8tARndyACRvKK6OOqs-DWv182Trlk2QkwdUBjk5v-g7gPkYpzMpzFlYne1ExSehOVnJUinAXCBQ"
    }
};
