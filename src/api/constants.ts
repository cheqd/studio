export const HEADERS = {
	json: { 'Content-Type': 'application/json' },
	text: { 'Content-Type': 'text/plain' },
}

export const CORS_HEADERS: Iterable<[string, string]> = [
	['Access-Control-Allow-Origin', '*'],
	['Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS'],
	['Access-Control-Max-Age', '86400']
]

export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1', 'https://veramo.io/contexts/profile/v1']
export const VC_PERSON_CONTEXT = ['https://schema.org/Person']
export const VC_EVENTRESERVATION_CONTEXT = ['https://schema.org/EventReservation']
export const VC_TICKET_CONTEXT = ['https://schema.org/Ticket']
export const VC_TYPE = 'VerifiableCredential'
export const VC_PROOF_FORMAT = 'jwt'
export const VC_REMOVE_ORIGINAL_FIELDS = false
