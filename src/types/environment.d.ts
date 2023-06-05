declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAINNET_RPC_URL: string
      TESTNET_RPC_URL: string
      RESOLVER_URL: string
      ALLOWED_ORIGINS: string | undefined
      ENABLE_EXTERNAL_DB: string
      EXTERNAL_DB_CONNECTION_URL: string
      EXTERNAL_DB_ENCRYPTION_KEY: string
      EXTERNAL_DB_CERT: string | undefined

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
      ENABLE_AUTH: string | undefined
      CUSTOMER_ID: string | undefined
    }
  }
}

export { }

