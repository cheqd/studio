export const HEADERS = {
	json: { 'Content-Type': 'application/json' },
	text: { 'Content-Type': 'text/plain' },
}

export const CORS_HEADERS: Iterable<[string, string]> = [
	['Access-Control-Allow-Origin', '*'],
	['Access-Control-Allow-Methods', 'GET,OPTIONS'],
	['Access-Control-Max-Age', '86400']
]

export const ISSUER_ID = _ISSUER_ID

export const ISSUER_ID_PRIVATE_KEY_HEX = _ISSUER_ID_PRIVATE_KEY_HEX

export const ISSUER_ID_PUBLIC_KEY_HEX = _ISSUER_ID_PUBLIC_KEY_HEX

export const ISSUER_ID_KID = _ISSUER_ID_KID

export const ISSUER_ID_METHOD_SPECIFIC_ID = _ISSUER_ID_METHOD_SPECIFIC_ID

export const ISSUER_ID_METHOD = _ISSUER_ID_METHOD

export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1', 'https://veramo.io/contexts/profile/v1', 'https://schema.org/Person']

export const VC_TYPE = 'VerifiableCredential'

export const VC_PROOF_FORMAT = 'jwt'

export const VC_REMOVE_ORIGINAL_FIELDS = false

export const VC_AUTH0_URI = _AUTH0_SERVICE_ENDPOINT

export const COSMOS_PAYER_MENMONIC = _COSMOS_PAYER_MNEMONIC

export const NETWORK_RPC_URL = _NETWORK_RPC_URL
