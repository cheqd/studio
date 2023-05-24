export const HEADERS = {
	json: { 'Content-Type': 'application/json' },
	text: { 'Content-Type': 'text/plain' },
}

export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1', 'https://veramo.io/contexts/profile/v1']
export const VC_TYPE: string = 'VerifiableCredential'
export const VC_PROOF_FORMAT = 'jwt'
export const VC_REMOVE_ORIGINAL_FIELDS = false
export const CORS_ERROR_MSG = 'The CORS policy for this site does not allow access from the specified Origin.'
