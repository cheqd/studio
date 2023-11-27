import { JWT_PROOF_TYPE } from "../types/constants";

// ------------------
// CREDENTIAL
// ------------------

export const CREDENTIAL_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo3YmY4MWEyMC02MzNjLTRjYzctYmM0YS01YTQ1ODAxMDA1ZTAiLCJuYmYiOjE2ODYyMzIxNjgsInN1YiI6ImRpZDprZXk6ejZNa2hhWGdCWkR2b3REa0w1MjU3ZmFpenRpR2lDMlF0S0xHcGJubkVHdGEyZG9LIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3NjaGVtYS5vcmciLCJodHRwczovL3ZlcmFtby5pby9jb250ZXh0cy9wcm9maWxlL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImdlbmRlciI6Im1hbGUiLCJuYW1lIjoiQm9iIn0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJQZXJzb24iXX19.wMfdR6RtyAZA4eoWya5Aw97wwER2Cm5Guk780Xw8H9fA3sfudIJeLRLboqixpTchqSbYeA7KbuCTAnLgXTD_Cg';
export const CREDENTIAL_SUBJECT_ID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
export const ISSUIER_DID = 'did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0';

export const CREDENTIAL_OBJECT = {
    issuer: {
        id: ISSUIER_DID
    },
    credentialSubject: {
        gender: "male",
        name: "Bob",
        id: CREDENTIAL_SUBJECT_ID
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

export const PRESENTATION_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2cCI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVQcmVzZW50YXRpb24iXSwidmVyaWZpYWJsZUNyZWRlbnRpYWwiOlsiZXlKaGJHY2lPaUpGWkVSVFFTSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKa2FXUTZZMmhsY1dRNmRHVnpkRzVsZERvM1ltWTRNV0V5TUMwMk16TmpMVFJqWXpjdFltTTBZUzAxWVRRMU9EQXhNREExWlRBaUxDSnVZbVlpT2pFMk9EWXlNekl4Tmpnc0luTjFZaUk2SW1ScFpEcHJaWGs2ZWpaTmEyaGhXR2RDV2tSMmIzUkVhMHcxTWpVM1ptRnBlblJwUjJsRE1sRjBTMHhIY0dKdWJrVkhkR0V5Wkc5TElpd2lkbU1pT25zaVFHTnZiblJsZUhRaU9sc2lhSFIwY0hNNkx5OTNkM2N1ZHpNdWIzSm5Mekl3TVRndlkzSmxaR1Z1ZEdsaGJITXZkakVpTENKb2RIUndjem92TDNOamFHVnRZUzV2Y21jaUxDSm9kSFJ3Y3pvdkwzWmxjbUZ0Ynk1cGJ5OWpiMjUwWlhoMGN5OXdjbTltYVd4bEwzWXhJbDBzSW1OeVpXUmxiblJwWVd4VGRXSnFaV04wSWpwN0ltZGxibVJsY2lJNkltMWhiR1VpTENKdVlXMWxJam9pUW05aUluMHNJblI1Y0dVaU9sc2lWbVZ5YVdacFlXSnNaVU55WldSbGJuUnBZV3dpTENKUVpYSnpiMjRpWFgxOS53TWZkUjZSdHlBWkE0ZW9XeWE1QXc5N3d3RVIyQ201R3VrNzgwWHc4SDlmQTNzZnVkSUplTFJMYm9xaXhwVGNocVNiWWVBN0tidUNUQW5MZ1hURF9DZyJdfSwibmJmIjoxNzAxMTIxNTE3LCJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo0Yjg0NmQwZi0yZjZjLTRhYjYtOWZlMi01YjhkYjMwMWM4M2MiLCJhdWQiOlsiZGlkOmNoZXFkOnRlc3RuZXQ6OGM3MWU5YjYtYzVhMy00MjUwLThjNTgtZmE1OTE1MzNjZDIyIl19.7czKZikP7ZHceVIbgVZLBhG9d0D-vwHgVUc2I4LM-acDIlk1Sxh_VpBZtLmJhyE5LaBvTh5Gs1Coc2aCXYdNBg';
// export const P_CREDENTIAL_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc2NoZW1hLm9yZy9zY2hlbWEuanNvbmxkIiwiaHR0cHM6Ly92ZXJhbW8uaW8vY29udGV4dHMvcHJvZmlsZS92MSIsImh0dHBzOi8vdzNpZC5vcmcvdmMtc3RhdHVzLWxpc3QtMjAyMS92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiUGVyc29uIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7Im5hbWUiOiJCb2IiLCJnZW5kZXIiOiJtYWxlIn0sImNyZWRlbnRpYWxTdGF0dXMiOnsiaWQiOiJodHRwczovL3Jlc29sdmVyLmNoZXFkLm5ldC8xLjAvaWRlbnRpZmllcnMvZGlkOmNoZXFkOnRlc3RuZXQ6OTBkNWMxNDEtNzI0Zi00N2FkLTlhZTctYTdjMzNhOWU1NjQzP3Jlc291cmNlTmFtZT1zdXNwZW5zaW9uRW4mcmVzb3VyY2VUeXBlPVN0YXR1c0xpc3QyMDIxU3VzcGVuc2lvbiMxMzMzOCIsInR5cGUiOiJTdGF0dXNMaXN0MjAyMUVudHJ5Iiwic3RhdHVzUHVycG9zZSI6InN1c3BlbnNpb24iLCJzdGF0dXNMaXN0SW5kZXgiOiIxMzMzOCJ9fSwic3ViIjoiZGlkOmtleTp6Nk1raGFYZ0JaRHZvdERrTDUyNTdmYWl6dGlHaUMyUXRLTEdwYm5uRUd0YTJkb0siLCJuYmYiOjE3MDA0NzM0MTYsImlzcyI6ImRpZDpjaGVxZDp0ZXN0bmV0OjkwZDVjMTQxLTcyNGYtNDdhZC05YWU3LWE3YzMzYTllNTY0MyJ9.-14Ril1pZEy2HEEo48gTJr2yOtGxBhUGTFmzVdjAtyhFRsW5zZg9onHt6V9JQ8BaiYBlTkP9GzTnJ-O6hdiyCw'
export const HOLDER_DID = 'did:cheqd:testnet:4b846d0f-2f6c-4ab6-9fe2-5b8db301c83c';
export const VERIFIER_DID = 'did:cheqd:testnet:8c71e9b6-c5a3-4250-8c58-fa591533cd22';

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