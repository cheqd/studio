import { EnvironmentType } from "@verida/types"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAINNET_RPC_URL: string
      TESTNET_RPC_URL: string
	  RESOLVER_URL: string
      ALLOWED_ORIGINS: string | undefined
      DB_CONNECTION_URL: string
      DB_ENCRYPTION_KEY: string
      ISSUER_DATABASE_CERT: string | undefined
      APPLICATION_BASE_URL: string

      // LogTo
      LOGTO_ENDPOINT: string
      LOGTO_APP_ID: string
      LOGTO_APP_SECRET: string
      AUDIENCE_ENDPOINT: string

      // verida
      USE_VERIDA_CONNECTOR: boolean
      VERIDA_PRIVATE_KEY: string
      POLYGON_PRIVATE_KEY: string
      VERIDA_NETWORK: EnvironmentType

      // auth
      ENABLE_AUTH: string | undefined
      CUSTOMER_ID: string | undefined
      ALL_SCOPES: string
      COOKIE_SECRET: string
    }
  }
}

export { }

