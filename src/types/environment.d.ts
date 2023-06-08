import { EnvironmentType } from "@verida/types"
import { Network } from "@verida/client-ts"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Base
      NODE_ENV: EnvironmentType
      PORT: string
      NPM_CONFIG_LOGLEVEL: string

      // Network API endpoints
      MAINNET_RPC_URL: string
      TESTNET_RPC_URL: string
      RESOLVER_URL: string
      ALLOWED_ORIGINS: string | undefined
      ENABLE_EXTERNAL_DB: string
      EXTERNAL_DB_CONNECTION_URL: string
      EXTERNAL_DB_ENCRYPTION_KEY: string
      EXTERNAL_DB_CERT: string | undefined
      APPLICATION_BASE_URL: string

      // LogTo
      LOGTO_ENDPOINT: string
      LOGTO_APP_ID: string
      LOGTO_APP_SECRET: string
      LOGTO_RESOURCE_URL: string

      // Authentication
      ENABLE_AUTHENTICATION: string
      DEFAULT_CUSTOMER_ID: string | undefined
      ALL_SCOPES: string
      COOKIE_SECRET: string

      // Verida
      ENABLE_VERIDA_CONNECTOR: string
      VERIDA_NETWORK: NetworkType
      POLYGON_RPC_URL: string
      VERIDA_PRIVATE_KEY: string
      POLYGON_PRIVATE_KEY: string

      // Without external db
      ISSUER_ID_PRIVATE_KEY_HEX: string
      ISSUER_ID_PUBLIC_KEY_HEX: string
      FEE_PAYER_MNEMONIC: string
      ISSUER_DID: string
    }
  }
}

export { }

