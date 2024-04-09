import type { EnvironmentType } from '@verida/types';
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
// By default we don't send events to datadog
export const ENABLE_DATADOG = process.env.ENABLE_DATADOG === 'true' ? true : false;
// Possible cases 'trace' 'debug' 'info' 'warn' 'error';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

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
	getAccessToken: false,
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
export const POLYGON_RPC_URL: Record<EnvironmentType.MAINNET | EnvironmentType.TESTNET, string> = {
	mainnet: process.env.POLYGON_RPC_URL_MAINNET || 'https://polygon-rpc.com',
	testnet: process.env.POLYGON_RPC_URL_TESTNET || 'https://rpc.ankr.com/polygon_mumbai',
};

export const VERIDA_APP_NAME = 'Cheqd Verida Connector';
// Schema to store a Verifiable Credential on the Verida Network.
export const VERIDA_CREDENTIAL_RECORD_SCHEMA = 'https://common.schemas.verida.io/credential/base/v0.2.0/schema.json';

export enum OperationCategoryNameEnum {
	DID = 'did',
	RESOURCE = 'resource',
	CREDENTIAL_STATUS = 'credential-status',
	CREDENTIAL = 'credential',
	PRESENTATION = 'presentation',
	KEY = 'key',
	SUBSCRIPTION = 'subscription',
}

export enum OperationDefaultFeeEnum {
	DID_UPDATE = 25000000000,
	DID_CREATE = 50000000000,
	DID_DEACTIVATE = 10000000000,
	RESOURCE_CREATE_IMAGE = 10000000000,
	RESOURCE_CREATE_JSON = 2500000000,
	RESOURCE_CREATE_OTHER = 5000000000,
}

export enum OperationNameEnum {
	// DID operations
	DID_CREATE = 'did-create',
	DID_UPDATE = 'did-update',
	DID_DEACTIVATE = 'did-deactivate',
	DID_SEARCH = 'did-search',
	DID_IMPORT = 'did-import',
	DID_LIST = 'did-list',
	// Resource operations
	RESOURCE_CREATE = 'resource-create',
	RESOURCE_SEARCH = 'resource-search',

	// StatusList2021 operations
	CREDENTIAL_STATUS_CREATE_UNENCRYPTED = 'credential-status-create-unencrypted',
	CREDENTIAL_STATUS_CREATE_ENCRYPTED = 'credential-status-create-encrypted',
	CREDENTIAL_STATUS_UPDATE_UNENCRYPTED = 'credential-status-update-unencrypted',
	CREDENTIAL_STATUS_UPDATE_ENCRYPTED = 'credential-status-update-encrypted',
	CREDENTIAL_STATUS_CHECK = 'credential-status-check',
	CREDENTIAL_STATUS_SEARCH = 'credential-status-search',
	// Credential operations
	CREDENTIAL_ISSUE = 'credential-issue',
	CREDENTIAL_VERIFY = 'credential-verify',
	CREDENTIAL_REVOKE = 'credential-revoke',
	CREDENTIAL_SUSPEND = 'credential-suspend',
	CREDENTIAL_UNSUSPEND = 'credential-unsuspend',
	// Account
	ACCOUNT_CREATE = 'account-create',
	ACCOUNT_GET = 'account-get',
	ACCOUNT_GET_ID_TOKEN = 'account-get-id-token',
	// Key operations
	KEY_CREATE = 'key-create',
	KEY_IMPORT = 'key-import',
	KEY_READ = 'key-read',
	// Presentation operations
	PRESENTATION_CREATE = 'presentation-create',
	PRESENTATION_VERIFY = 'presentation-verify',
	// Subscription
	SUBSCRIPTION_CREATE = 'subscription-create',
	SUBSCRIPTION_CANCEL = 'subscription-cancel',
	SUBSCRIPTION_UPDATE = 'subscription-update',
	SUBSCRIPTION_TRIAL_WILL_END = 'subscription-trial-will-end',

	// Stripe operations
	STRIPE_ACCOUNT_CREATE = 'stripe-account-create',
}

export const JWT_PROOF_TYPE = 'JwtProof2020';
export const StatusList2021Entry = 'StatusList2021Entry';
export const JSONLD_PROOF_TYPES = ['Ed25519Signature2018', 'Ed25519Signature2020'];
