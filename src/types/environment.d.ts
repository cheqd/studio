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
      CORS_ALLOWED_ORIGINS: string | undefined
      ENABLE_EXTERNAL_DB: string | "false"
      EXTERNAL_DB_CONNECTION_URL: string
      EXTERNAL_DB_ENCRYPTION_KEY: string
      EXTERNAL_DB_CERT: string | undefined
      APPLICATION_BASE_URL: string | "http://localhost:3000"

      // LogTo
      LOGTO_ENDPOINT: string
      LOGTO_APP_ID: string
      LOGTO_APP_SECRET: string
      LOGTO_DEFAULT_RESOURCE_URL: string
      LOGTO_M2M_APP_ID: string
      LOGTO_M2M_APP_SECRET: string
      LOGTO_MANAGEMENT_API: string

      // Authentication
      ENABLE_AUTHENTICATION: string | "false"
      DEFAULT_CUSTOMER_ID: string | undefined
      COOKIE_SECRET: string

      // Verida
      ENABLE_VERIDA_CONNECTOR: string | "false"
      VERIDA_NETWORK: NetworkType
      POLYGON_RPC_URL: string
      VERIDA_PRIVATE_KEY: string
      POLYGON_PRIVATE_KEY: string

      // Without external db
      ISSUER_PRIVATE_KEY_HEX: string
      ISSUER_PUBLIC_KEY_HEX: string
      DEFAULT_FEE_PAYER_MNEMONIC: string
      ISSUER_DID: string
    }
  }
}

export { }

