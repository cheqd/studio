export const TESTNET_DID = "did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f90";
export const TESTNET_DID_FRAGMENT = "key-1";
export const TESTNET_DID_RESOURCE_ID = "cc0a6502-03bf-422d-9a91-ad0a3755f302"

export const VALID_JWT_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZyIsImh0dHBzOi8vdmVyYW1vLmlvL2NvbnRleHRzL3Byb2ZpbGUvdjEiLCJodHRwczovL3czaWQub3JnL3ZjLXN0YXR1cy1saXN0LTIwMjEvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlBlcnNvbiJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJnZW5kZXIiOiJtYWxlIiwibmFtZSI6IkJvYiJ9LCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly9yZXNvbHZlci5jaGVxZC5uZXQvMS4wL2lkZW50aWZpZXJzL2RpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MD9yZXNvdXJjZU5hbWU9Y2hlcWQtZW1wbG95ZWUtY3JlZGVudGlhbHMmcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxUmV2b2NhdGlvbiMxMCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InJldm9jYXRpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE2OTQwODIyMDEsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0OmQ0YTEzMDAzLTBiYzUtNDYwOC1iMjNhLTU0ZWE5MGZlOWY5MCJ9.AsW39Jej_Qae2FbpVdzyUhhuTi9gVWTx9w5NEyUfJYM6gQuCSAigiwcmaZZrcBWjOm53NXi-jRP561BpdVuSBw"
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
