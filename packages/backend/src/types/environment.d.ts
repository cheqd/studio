declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAINNET_RPC_URL: string
      TESTNET_RPC_URL: string
	    RESOLVER_URL: string
      ALLOWED_ORIGINS: string | undefined
      ISSUER_DATABASE_URL: string
      DB_ENCRYPTION_KEY: string
      ISSUER_DATABASE_CERT: string | undefined
      OIDC_JWKS_ENDPOINT: string
      AUDIENCE_ENDPOINT: string
      OIDC_ISSUER: string
    }
  }
}

export { }

