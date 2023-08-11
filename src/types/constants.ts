import * as dotenv from 'dotenv';
dotenv.config();

const { LOGTO_ENDPOINT, LOGTO_APP_ID, LOGTO_APP_SECRET, APPLICATION_BASE_URL } = process.env;

export const HEADERS = {
	json: { 'Content-Type': 'application/json' },
	text: { 'Content-Type': 'text/plain' },
};

export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1', 'https://veramo.io/contexts/profile/v1'];
export const VC_TYPE = 'VerifiableCredential';
export const VC_PROOF_FORMAT = 'jwt';
export const VC_REMOVE_ORIGINAL_FIELDS = true;
export const CORS_ERROR_MSG = 'The CORS policy for this site does not allow access from the specified Origin.';

// verida
export const POLYGON_RPC_URL = 'https://rpc-mumbai.maticvigil.com';
export const VERIDA_APP_NAME = 'Cheqd Verida Connector';

// Schema to store a Verifiable Credential on the Verida Network.
export const VERIDA_CREDENTIAL_RECORD_SCHEMA = 'https://common.schemas.verida.io/credential/base/v0.2.0/schema.json';

// Map for path and required user scope for that action
export const configLogToExpress = {
	endpoint:
		LOGTO_ENDPOINT ||
		(function () {
			throw new Error('LOGTO_ENDPOINT is not defined');
		})(),
	appId:
		LOGTO_APP_ID ||
		(function () {
			throw new Error('LOGTO_APP_ID is not defined');
		})(),
	appSecret:
		LOGTO_APP_SECRET ||
		(function () {
			throw new Error('LOGTO_APP_SECRET is not defined');
		})(),
	baseUrl:
		APPLICATION_BASE_URL ||
		(function () {
			throw new Error('APPLICATION_BASE_URL is not defined');
		})(),
	getAccessToken: true,
	fetchUserInfo: true,
};

export const DEFAULT_FAUCET_DENOM = process.env.FAUCET_DENOM || 'ncheq';
export const DEFAULT_FAUCET_URI = process.env.FAUCET_URI || 'https://faucet-api.cheqd.network/credit';
// Amount for creating DID
export const TESTNET_MINIMUM_BALANCE = process.env.TESTNET_MINIMUM_BALANCE || 50000000000;
