declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAINNET_RPC_URL: string
      TESTNET_RPC_URL: string
	  RESOLVER_URL: string
      ALLOWED_ORIGINS: string | undefined
      ISSUER_DATABASE_URL: string
      ISSUER_SECRET_KEY: string
      ISSUER_DATABASE_CERT: string | undefined
    }
  }
}

export { }

