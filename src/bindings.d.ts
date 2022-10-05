export { }

declare global {
	// Env vars, secrets, KV bindings to be used
	// const ENV_VAR: string
	// const SECRET: string
	// const KV_NAMESPACE: KVNamespace

	const CREDENTIALS: KVNamespace

	const _ISSUER_ID: string

	const _ISSUER_ID_PRIVATE_KEY_HEX: string

	const _ISSUER_ID_PUBLIC_KEY_HEX: string

	const _ISSUER_ID_KID: string

	const _ISSUER_ID_METHOD_SPECIFIC_ID: string

	const _ISSUER_ID_METHOD: string

	const _COSMOS_PAYER_MNEMONIC: string

	const _NETWORK_RPC_URL: string

	const _AUTH0_SERVICE_ENDPOINT: string
}
