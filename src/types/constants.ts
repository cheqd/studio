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
export const API_KEY_PREFIX = 'caas';
export const API_SECRET_KEY_LENGTH = 64;
export const API_KEY_EXPIRATION = 30;
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
/**
 * Reads a positive number from an environment variable. An unset variable uses the fallback silently; a variable that
 * is set but invalid also uses the fallback but says so loudly, so a typo in a limit is not mistaken for the default.
 */
export const parseNumberEnv = (value: string | undefined, fallback: number, name = 'environment variable'): number => {
	if (!value?.trim()) return fallback;
	const parsed = Number(value);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	console.warn(`Ignoring invalid ${name}="${value}": expected a positive number. Using the default, ${fallback}.`);
	return fallback;
};

/** Like `parseNumberEnv`, but for whole numbers where 0 is meaningful (usually "disabled"). */
export const parseNonNegativeIntEnv = (
	value: string | undefined,
	fallback: number,
	name = 'environment variable'
): number => {
	if (!value?.trim()) return fallback;
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed >= 0) return parsed;
	console.warn(
		`Ignoring invalid ${name}="${value}": expected a whole number, 0 or more. Using the default, ${fallback}.`
	);
	return fallback;
};

export const MINIMAL_DENOM = 'ncheq';
export const FAUCET_URI = process.env.FAUCET_URI || 'https://faucet-api.cheqd.network/credit';
export const FAUCET_API_KEY = process.env.FAUCET_API_KEY || 'default-api-key';
export const DEFAULT_DENOM_EXPONENT = 9;
export const TESTNET_MINIMUM_BALANCE = parseNumberEnv(
	process.env.TESTNET_MINIMUM_BALANCE,
	10000,
	'TESTNET_MINIMUM_BALANCE'
);
// Amount, in CHEQ, a new account's testnet address is topped up to when it is bootstrapped (ENABLE_ACCOUNT_TOPUP).
// TESTNET_FAUCET_UPPER_CAP_CHEQ is the previous name and is still honoured as a fallback.
export const TESTNET_INITIAL_TOPUP_CHEQ = parseNumberEnv(
	process.env.TESTNET_INITIAL_TOPUP_CHEQ || process.env.TESTNET_FAUCET_UPPER_CAP_CHEQ,
	TESTNET_MINIMUM_BALANCE,
	process.env.TESTNET_INITIAL_TOPUP_CHEQ ? 'TESTNET_INITIAL_TOPUP_CHEQ' : 'TESTNET_FAUCET_UPPER_CAP_CHEQ'
);
// Most CHEQ a customer can request through POST /account/faucet per calendar month (UTC)
export const FAUCET_MONTHLY_LIMIT_CHEQ = parseNumberEnv(
	process.env.FAUCET_MONTHLY_LIMIT_CHEQ,
	100000,
	'FAUCET_MONTHLY_LIMIT_CHEQ'
);
// Most CHEQ a single testnet address can hold before POST /account/faucet stops topping it up.
// Defaults to the monthly limit, so there is one figure unless this is set explicitly.
export const FAUCET_ADDRESS_CAP_CHEQ = parseNumberEnv(
	process.env.FAUCET_ADDRESS_CAP_CHEQ,
	FAUCET_MONTHLY_LIMIT_CHEQ,
	'FAUCET_ADDRESS_CAP_CHEQ'
);
// How long, in seconds, the faucet endpoint caches a customer's Stripe subscription status and plan, so API-key
// use does not call Stripe on every request. 0 disables the cache.
export const FAUCET_SUBSCRIPTION_CACHE_SECONDS = parseNonNegativeIntEnv(
	process.env.FAUCET_SUBSCRIPTION_CACHE_SECONDS,
	60,
	'FAUCET_SUBSCRIPTION_CACHE_SECONDS'
);
// Minimum gap, in seconds, between two faucet requests from the same customer (0 disables), so a script using an
// API key cannot hammer the endpoint (and Stripe, the RPC node and the faucet behind it) in a tight loop.
export const FAUCET_MIN_INTERVAL_SECONDS = parseNonNegativeIntEnv(
	process.env.FAUCET_MIN_INTERVAL_SECONDS,
	10,
	'FAUCET_MIN_INTERVAL_SECONDS'
);
// How long, in seconds, a faucet quota reservation that has not been confirmed keeps counting towards the quota
// before it is treated as abandoned (e.g. the process died before calling the faucet). Must be longer than the
// longest time a faucet call can take. Reservations whose faucet call threw (outcome unknown) always keep counting.
export const FAUCET_PENDING_TIMEOUT_SECONDS = parseNonNegativeIntEnv(
	process.env.FAUCET_PENDING_TIMEOUT_SECONDS,
	600,
	'FAUCET_PENDING_TIMEOUT_SECONDS'
);
// How long, in seconds, to wait for the faucet service to answer before giving up. Without a limit a hung faucet
// holds the caller (and a quota reservation) for as long as Node's own default, several minutes.
export const FAUCET_REQUEST_TIMEOUT_SECONDS = parseNumberEnv(
	process.env.FAUCET_REQUEST_TIMEOUT_SECONDS,
	30,
	'FAUCET_REQUEST_TIMEOUT_SECONDS'
);
export const FAUCET_AMOUNT = parseNumberEnv(process.env.FAUCET_AMOUNT, 100000000000000, 'FAUCET_AMOUNT');
export const FAUCET_ACCESS_CLIENT_ID = process.env.FAUCET_ACCESS_CLIENT_ID || '';
export const FAUCET_ACCESS_CLIENT_SECRET = process.env.FAUCET_ACCESS_CLIENT_SECRET || '';

// CHEQ market data (CoinGecko), used by GET /account/balances for CHEQ to USD conversion
export const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
export const COINGECKO_TOKEN_ID = process.env.COINGECKO_TOKEN_ID || 'cheqd-network';
export const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
export const CHEQ_USD_RATE_CACHE_TTL = parseNumberEnv(process.env.CHEQ_USD_RATE_CACHE_TTL, 300); // seconds

// Verifiable Credential constants
export const VC_CONTEXT = ['https://www.w3.org/2018/credentials/v1'];
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
	API_KEY = 'api-key',
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
	DID_EXPORT = 'did-export',
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
	CREDENTIAL_STATUS_FULL = 'credential-status-full',
	CREDENTIAL_STATUS_THRESHOLD_REACHED = 'credential-status-threshold-reached',

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

	// API key operations
	API_KEY_CREATE = 'api-key-create',
	API_KEY_UPDATE = 'api-key-update',
	API_KEY_REVOKE = 'api-key-revoke',
	API_KEY_GET = 'api-key-get',
	API_KEY_LIST = 'api-key-list',

	// Stripe operations
	STRIPE_ACCOUNT_CREATE = 'stripe-account-create',
}

export const JWT_PROOF_TYPE = 'JwtProof2020';
export const StatusList2021Entry = 'StatusList2021Entry';
export const BitstringStatusListEntry = 'BitstringStatusListEntry';
export const JSONLD_PROOF_TYPES = ['Ed25519Signature2018', 'Ed25519Signature2020', 'JsonWebSignature2020'];
export const DEFAULT_PAGINATION_LIST_LIMIT = 10;
export const DefaultStudioRoleName = 'default' as const;
export const MaxAllowedTrialPeriodDays = 30;
