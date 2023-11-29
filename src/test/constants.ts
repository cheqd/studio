import { JWT_PROOF_TYPE } from "../types/constants";

// ------------------
// CREDENTIAL
// ------------------

export const CREDENTIAL_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZy9zY2hlbWEuanNvbmxkIiwiaHR0cHM6Ly92ZXJhbW8uaW8vY29udGV4dHMvcHJvZmlsZS92MSIsImh0dHBzOi8vdzNpZC5vcmcvdmMtc3RhdHVzLWxpc3QtMjAyMS92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiUGVyc29uIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7Im5hbWUiOiJCb2IiLCJnZW5kZXIiOiJtYWxlIn0sImNyZWRlbnRpYWxTdGF0dXMiOnsiaWQiOiJodHRwczovL3Jlc29sdmVyLmNoZXFkLm5ldC8xLjAvaWRlbnRpZmllcnMvZGlkOmNoZXFkOnRlc3RuZXQ6OTBkNWMxNDEtNzI0Zi00N2FkLTlhZTctYTdjMzNhOWU1NjQzP3Jlc291cmNlTmFtZT1zdXNwZW5zaW9uRW4mcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxU3VzcGVuc2lvbiMxMzMzOCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InN1c3BlbnNpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMzMzOCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE3MDA0NzM0MTYsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0OjkwZDVjMTQxLTcyNGYtNDdhZC05YWU3LWE3YzMzYTllNTY0MyJ9.-14Ril1pZEy2HEEo48gTJr2yOtGxBhUGTFmzVdjAtyhFRsW5zZg9onHt6V9JQ8BaiYBlTkP9GzTnJ-O6hdiyCw';
export const CREDENTIAL_SUBJECT_ID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
export const ISSUIER_DID = 'did:cheqd:testnet:90d5c141-724f-47ad-9ae7-a7c33a9e5643';
export const CREDENTIAL_STATUS_ID = 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:90d5c141-724f-47ad-9ae7-a7c33a9e5643?resourceName=suspensionEn&resourceType=StatusList2021Suspension#13338';

export const CREDENTIAL_OBJECT = {
    issuer: {
        id: ISSUIER_DID
    },
    credentialSubject: {
        gender: "male",
        name: "Bob",
        id: CREDENTIAL_SUBJECT_ID
    },
    credentialStatus: {
        id: CREDENTIAL_STATUS_ID,
        statusPurpose: "suspension",
        statusListIndex: "13338",
        type: 'StatusList2021Entry'
    },
    type: ["VerifiableCredential", "Person"],
    '@context': [
        "https://www.w3.org/2018/credentials/v1",
      "https://schema.org",
      "https://veramo.io/contexts/profile/v1"
    ],
    issuanceDate: '2023-06-08T13:49:28.000Z',
    proof: {
        type: JWT_PROOF_TYPE,
        jwt: CREDENTIAL_JWT
    }
}


// ------------------
// PRESENTATION
// ------------------

export const PRESENTATION_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2cCI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVQcmVzZW50YXRpb24iXSwidmVyaWZpYWJsZUNyZWRlbnRpYWwiOlsiZXlKaGJHY2lPaUpGWkVSVFFTSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjJZeUk2ZXlKQVkyOXVkR1Y0ZENJNld5Sm9kSFJ3Y3pvdkwzZDNkeTUzTXk1dmNtY3ZNakF4T0M5amNtVmtaVzUwYVdGc2N5OTJNU0lzSW1oMGRIQnpPaTh2YzJOb1pXMWhMbTl5Wnk5elkyaGxiV0V1YW5OdmJteGtJaXdpYUhSMGNITTZMeTkyWlhKaGJXOHVhVzh2WTI5dWRHVjRkSE12Y0hKdlptbHNaUzkyTVNJc0ltaDBkSEJ6T2k4dmR6TnBaQzV2Y21jdmRtTXRjM1JoZEhWekxXeHBjM1F0TWpBeU1TOTJNU0pkTENKMGVYQmxJanBiSWxabGNtbG1hV0ZpYkdWRGNtVmtaVzUwYVdGc0lpd2lVR1Z5YzI5dUlsMHNJbU55WldSbGJuUnBZV3hUZFdKcVpXTjBJanA3SW01aGJXVWlPaUpDYjJJaUxDSm5aVzVrWlhJaU9pSnRZV3hsSW4wc0ltTnlaV1JsYm5ScFlXeFRkR0YwZFhNaU9uc2lhV1FpT2lKb2RIUndjem92TDNKbGMyOXNkbVZ5TG1Ob1pYRmtMbTVsZEM4eExqQXZhV1JsYm5ScFptbGxjbk12Wkdsa09tTm9aWEZrT25SbGMzUnVaWFE2T1RCa05XTXhOREV0TnpJMFppMDBOMkZrTFRsaFpUY3RZVGRqTXpOaE9XVTFOalF6UDNKbGMyOTFjbU5sVG1GdFpUMXpkWE53Wlc1emFXOXVSVzRtY21WemIzVnlZMlZVZVhCbFBWTjBZWFIxYzB4cGMzUXlNREl4VTNWemNHVnVjMmx2YmlNeE16TXpPQ0lzSW5SNWNHVWlPaUpUZEdGMGRYTk1hWE4wTWpBeU1VVnVkSEo1SWl3aWMzUmhkSFZ6VUhWeWNHOXpaU0k2SW5OMWMzQmxibk5wYjI0aUxDSnpkR0YwZFhOTWFYTjBTVzVrWlhnaU9pSXhNek16T0NKOWZTd2ljM1ZpSWpvaVpHbGtPbXRsZVRwNk5rMXJhR0ZZWjBKYVJIWnZkRVJyVERVeU5UZG1ZV2w2ZEdsSGFVTXlVWFJMVEVkd1ltNXVSVWQwWVRKa2Iwc2lMQ0p1WW1ZaU9qRTNNREEwTnpNME1UWXNJbWx6Y3lJNkltUnBaRHBqYUdWeFpEcDBaWE4wYm1WME9qa3daRFZqTVRReExUY3lOR1l0TkRkaFpDMDVZV1UzTFdFM1l6TXpZVGxsTlRZME15SjkuLTE0UmlsMXBaRXkySEVFbzQ4Z1RKcjJ5T3RHeEJoVUdURm16VmRqQXR5aEZSc1c1elpnOW9uSHQ2VjlKUThCYWlZQmxUa1A5R3pUbkotTzZoZGl5Q3ciXX0sIm5iZiI6MTcwMTE3NDQyMiwiaXNzIjoiZGlkOmNoZXFkOnRlc3RuZXQ6OGM3MWU5YjYtYzVhMy00MjUwLThjNTgtZmE1OTE1MzNjZDIyIiwiYXVkIjpbImRpZDpjaGVxZDp0ZXN0bmV0OjRiODQ2ZDBmLTJmNmMtNGFiNi05ZmUyLTViOGRiMzAxYzgzYyJdfQ.C3lgGtU5jKwCv1Zz50T1-hjjJbQaq2Z8yxon_KhEciyUig4cb-Whh92htolA62a1qVewySfOSR5q2OBmTGEOAQ';
export const HOLDER_DID = 'did:cheqd:testnet:8c71e9b6-c5a3-4250-8c58-fa591533cd22';
export const VERIFIER_DID = 'did:cheqd:testnet:4b846d0f-2f6c-4ab6-9fe2-5b8db301c83c';

export const PRESENTATION_OBJECT_CREDENTIAL_JWT = {
    '@context': [
        "https://www.w3.org/2018/credentials/v1"
      ],
    type: ["VerifiablePresentation"],
    verifiableCredential: [CREDENTIAL_JWT],
    holder: HOLDER_DID,
    verifier: [ VERIFIER_DID] ,
    proof: {
        type: JWT_PROOF_TYPE,
        jwt: PRESENTATION_JWT
    }
}

export const PRESENTATION_OBJECT_CREDENTIAL_OBJECT = {
    '@context': [
        "https://www.w3.org/2018/credentials/v1"
      ],
    type: ["VerifiablePresentation"],
    verifiableCredential: [CREDENTIAL_OBJECT],
    holder: HOLDER_DID,
    verifier: [ VERIFIER_DID] ,
    proof: {
        type: JWT_PROOF_TYPE,
        jwt: PRESENTATION_JWT
    }
}