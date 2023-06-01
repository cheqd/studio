declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAINNET_RPC_URL: string
      TESTNET_RPC_URL: string
	    RESOLVER_URL: string
      ALLOWED_ORIGINS: string | undefined
      DB_CONNECTION_URL: string
      DB_ENCRYPTION_KEY: string
      DB_CERTIFICATE: string | undefined

      // LogTo
      OIDC_JWKS_ENDPOINT: string
      AUDIENCE_ENDPOINT: string
      OIDC_ISSUER: string

      // verida
      USE_VERIDA_CONNECTOR: boolean
      VERIDA_PRIVATE_KEY: string
      POLYGON_PRIVATE_KEY: string
      VERIDA_NETWORK: EnvironmentType

      // auth
      ENABLE_AUTHENTICATION: string | undefined
      DEFAULT_CUSTOMER_ID: string | undefined
    }
  }
}

export { }

