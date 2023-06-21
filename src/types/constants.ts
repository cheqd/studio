import { ReservedScope, UserScope } from '@logto/express'
import * as dotenv from 'dotenv'
dotenv.config()

const {ALL_API_RESOURCES, 
	ALL_POSSIBLE_SCOPES, 
	LOGTO_ENDPOINT, 
	LOGTO_DEFAULT_RESOURCE_URL, 
	LOGTO_APP_ID, 
	LOGTO_APP_SECRET, 
	APPLICATION_BASE_URL} = process.env


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

const all_scopes: string[] = ALL_POSSIBLE_SCOPES ? ALL_POSSIBLE_SCOPES.split(' ') || [] : []
// ToDo: change it to the APPLICATION_BASE_URL. localhost is only for testing
const all_api_resources: string[] = ALL_API_RESOURCES ? ALL_API_RESOURCES.split(' ').map((scope) => `${"http://localhost"}/${scope}`) || [] : []
// Map for path and required user scope for that action
export const configLogToExpress = {
	endpoint: LOGTO_ENDPOINT,
	appId: LOGTO_APP_ID,
	appSecret: LOGTO_APP_SECRET,
	baseUrl: APPLICATION_BASE_URL,
	resources: [LOGTO_DEFAULT_RESOURCE_URL, ...all_api_resources], // You may need to replace it with your app's production address
	resource: LOGTO_DEFAULT_RESOURCE_URL,
	scopes: all_scopes,
	getAccessToken: true,
}