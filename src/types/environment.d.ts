import { EnvironmentType } from '@verida/types';

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			// Base
			NODE_ENV: EnvironmentType;
			PORT: string;
			NPM_CONFIG_LOGLEVEL: string;
			ENABLE_DATADOG: string | 'false';
			LOG_LEVEL: string | 'info';

			// Network API endpoints
			MAINNET_RPC_URL: string;
			TESTNET_RPC_URL: string;
			RESOLVER_URL: string;
			APPLICATION_BASE_URL: string | 'http://localhost:3000';
			CORS_ALLOWED_ORIGINS: string | APPLICATION_BASE_URL;
			ENABLE_EXTERNAL_DB: string | 'false';
			EXTERNAL_DB_CONNECTION_URL: string;
			EXTERNAL_DB_ENCRYPTION_KEY: string;
			EXTERNAL_DB_CERT: string | undefined;
			API_KEY_PREFIX: string;
			API_KEY_LENGTH: number;
			API_KEY_EXPIRATION: number;

			// LogTo
			LOGTO_ENDPOINT: string;
			LOGTO_APP_ID: string;
			LOGTO_APP_SECRET: string;
			LOGTO_DEFAULT_RESOURCE_URL: string;
			LOGTO_M2M_APP_ID: string;
			LOGTO_M2M_APP_SECRET: string;
			LOGTO_MANAGEMENT_API: string;
			LOGTO_DEFAULT_ROLE_ID: string;
			LOGTO_WEBHOOK_SECRET: string;

			// Authentication
			ENABLE_AUTHENTICATION: string | 'false';
			COOKIE_SECRET: string;

			// Verida
			ENABLE_VERIDA_CONNECTOR: string | 'false';
			POLYGON_RPC_URL_MAINNET: string;
			POLYGON_RPC_URL_TESTNET: string;
			VERIDA_PRIVATE_KEY: string;
			POLYGON_PRIVATE_KEY: string;

			// Without external db
			ISSUER_PRIVATE_KEY_HEX: string;
			ISSUER_PUBLIC_KEY_HEX: string;
			DEFAULT_FEE_PAYER_MNEMONIC: string;
			ISSUER_DID: string;

			// Faucet
			ENABLE_ACCOUNT_TOPUP: string | 'false';
			FAUCET_URI: string;
			TESTNET_MINIMUM_BALANCE: number;

			// Creds
			CREDS_DECRYPTION_SECRET: string;

			// Stripe
			STRIPE_ENABLED: string | 'false';
			STRIPE_SECRET_KEY: string;
			STRIPE_PUBLISHABLE_KEY: string;
			STRIPE_WEBHOOK_SECRET: string;
		}
	}

	namespace Express {
		interface Request {
			rawBody: Buffer;
		}
	}
}

export {};
