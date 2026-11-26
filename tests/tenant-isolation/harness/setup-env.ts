/**
 * Environment for the hermetic tier. Runs before any application module is imported, because several modules read
 * `process.env` at import time. Values already present in the environment win, so CI can point at its own database.
 * Nothing here is a real credential.
 */
const defaults: Record<string, string> = {
	ENABLE_EXTERNAL_DB: 'true',
	EXTERNAL_DB_CONNECTION_URL: 'postgres://postgres:test@localhost:54329/studio_test',
	// 32-byte hex key for the SecretBox. Test-only value.
	EXTERNAL_DB_ENCRYPTION_KEY: '0f'.repeat(32),
	ENABLE_AUTHENTICATION: 'true',
	LOGTO_ENDPOINT: 'http://logto.invalid',
	LOGTO_APP_ID: 'test-app-id',
	LOGTO_APP_SECRET: 'test-app-secret',
	LOGTO_M2M_APP_ID: 'test-m2m-id',
	LOGTO_M2M_APP_SECRET: 'test-m2m-secret',
	LOGTO_CLI_APP_IDS: '',
	LOGTO_DEFAULT_ROLE_ID: 'test-default-role',
	LOGTO_TESTNET_ROLE_ID: 'test-testnet-role',
	LOGTO_MAINNET_ROLE_ID: 'test-mainnet-role',
	LOGTO_WEBHOOK_SECRET: 'test-webhook-secret',
	COOKIE_SECRET: 'test-cookie-secret',
	APPLICATION_BASE_URL: 'http://localhost:3000',
	STRIPE_ENABLED: 'true',
	STRIPE_SECRET_KEY: 'sk_test_isolation_suite',
	PROVIDER_ENCRYPTION_KEY: 'ab'.repeat(16),
	ENABLE_VERIDA_CONNECTOR: 'false',
	LOG_LEVEL: 'error',
};

for (const [key, value] of Object.entries(defaults)) {
	if (process.env[key] === undefined) process.env[key] = value;
}
