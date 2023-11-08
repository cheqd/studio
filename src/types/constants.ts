import * as dotenv from 'dotenv';
dotenv.config();

// Header constants
export const HEADERS = {
	json: { 'Content-Type': 'application/json' },
	text: { 'Content-Type': 'text/plain' },
};

// Application constants
export const APPLICATION_BASE_URL = process.env.APPLICATION_BASE_URL || 'http://localhost:3000';
export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || APPLICATION_BASE_URL;

// LogTo contants
const { LOGTO_ENDPOINT, LOGTO_APP_ID, LOGTO_APP_SECRET, ENABLE_AUTHENTICATION } = process.env;

export const LOGTO_MANAGEMENT_API = process.env.LOGTO_MANAGEMENT_API || 'https://default.logto.app/api';

export const configLogToExpress = {
	endpoint:
		LOGTO_ENDPOINT ||
		(function () {
			if (ENABLE_AUTHENTICATION === 'true') throw new Error('LOGTO_ENDPOINT is not defined');
			return '';
		})(),
	appId:
		LOGTO_APP_ID ||
		(function () {
			if (ENABLE_AUTHENTICATION === 'true') throw new Error('LOGTO_APP_ID is not defined');
			return '';
		})(),
	appSecret:
		LOGTO_APP_SECRET ||
		(function () {
			if (ENABLE_AUTHENTICATION === 'true') throw new Error('LOGTO_APP_SECRET is not defined');
			return '';
		})(),
	baseUrl:
		APPLICATION_BASE_URL ||
		(function () {
			throw new Error('APPLICATION_BASE_URL is not defined');
		})(),
	getAccessToken: true,
	fetchUserInfo: true,
};

// Faucet constants
export const MINIMAL_DENOM = 'ncheq';
export const FAUCET_URI = process.env.FAUCET_URI || 'https://faucet-api.cheqd.network/credit';
export const DEFAULT_DENOM_EXPONENT = 9;
export const TESTNET_MINIMUM_BALANCE = process.env.TESTNET_MINIMUM_BALANCE || 1000;

// Verifiable Credential constants
export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1', 'https://veramo.io/contexts/profile/v1'];
export const VC_TYPE = 'VerifiableCredential';
export const VC_PROOF_FORMAT = 'jwt';
export const VC_REMOVE_ORIGINAL_FIELDS = true;
export const CORS_ERROR_MSG = 'The CORS policy for this site does not allow access from the specified Origin.';

// Verida
export const POLYGON_RPC_URL = 'https://rpc-mumbai.maticvigil.com';
export const VERIDA_APP_NAME = 'Cheqd Verida Connector';
// Schema to store a Verifiable Credential on the Verida Network.
export const VERIDA_CREDENTIAL_RECORD_SCHEMA = 'https://common.schemas.verida.io/credential/base/v0.2.0/schema.json';

export const OPERATION_CATEGORY_NAME_RESOURCE = 'resource';
export const OPERATION_CATEGORY_NAME_CREDENTIAL_STATUS = 'credential-status';
export const OPERATION_CATEGORY_NAME_CREDENTIAL = 'credential';

