declare global {
	namespace NodeJS {
		interface ProcessEnv {
			ISSUER_ID: string
			ISSUER_ID_PRIVATE_KEY_HEX: string
			ISSUER_ID_PUBLIC_KEY_HEX: string
			ISSUER_ID_KID: string
			ISSUER_ID_METHOD_SPECIFIC_ID: string
			ISSUER_ID_METHOD: string
			COSMOS_PAYER_MNEMONIC: string
			NETWORK_RPC_URL: string
			AUTH0_SERVICE_ENDPOINT: string
			EVENT_CONTEXT: string
			PERSON_CONTEXT: string
			RESOLVER_URL: string
			DISCORD_RESOURCE_ID: string
			GITHUB_RESOURCE_ID: string
			TWITTER_RESOURCE_ID: string
			EVENTBRITE_RESOURCE_ID: string
			IIW_LOGO_RESOURCE_ID: string
		}
	}
}

export { }

