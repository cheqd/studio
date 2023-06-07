import { ReservedScope, UserScope } from '@logto/express'
import * as dotenv from 'dotenv'
dotenv.config()

const {ALL_SCOPES, LOGTO_ENDPOINT, LOGTO_RESOURCE_URL, LOGTO_APP_ID, LOGTO_APP_SECRET, APPLICATION_BASE_URL} = process.env


export const HEADERS = {
	json: { 'Content-Type': 'application/json' },
	text: { 'Content-Type': 'text/plain' },
}

export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1', 'https://veramo.io/contexts/profile/v1']
export const VC_TYPE = 'VerifiableCredential'
export const VC_PROOF_FORMAT = 'jwt'
export const VC_REMOVE_ORIGINAL_FIELDS = true
export const CORS_ERROR_MSG = 'The CORS policy for this site does not allow access from the specified Origin.'


// verida
export const POLYGON_RPC_URL = 'https://rpc-mumbai.maticvigil.com'
export const VERIDA_APP_NAME = 'Cheqd Verida Connector'

// Schema to store a Verifiable Credential on the Verida Network.
export const VERIDA_CREDENTIAL_RECORD_SCHEMA =
  'https://common.schemas.verida.io/credential/base/v0.2.0/schema.json'

const all_scopes: string[] = ALL_SCOPES ? ALL_SCOPES.split(' ') || [] : [];
// Map for path and required user scope for that action
export const configLogToExpress = {
	endpoint: LOGTO_ENDPOINT,
	appId: LOGTO_APP_ID,
	appSecret: LOGTO_APP_SECRET,
	baseUrl: APPLICATION_BASE_URL,
	resources: [LOGTO_RESOURCE_URL], // You may need to replace it with your app's production address
	resource: LOGTO_RESOURCE_URL,
	scopes: [ReservedScope.OpenId, ReservedScope.OfflineAccess, UserScope.Identities, ...all_scopes],
	getAccessToken: true,
}