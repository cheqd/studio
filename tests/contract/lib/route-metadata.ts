/**
 * Hand-maintained classification of Studio routes for the contract suite.
 *
 * The route table itself (src/app.ts), the auth rules and the OpenAPI specs are parsed by
 * `inventory.ts`; this file only adds what cannot be derived from code: the risk tier and the
 * side effect of each route. Anything not listed here defaults to tier 2 and to an effect derived
 * from the HTTP method (GET is read-only, everything else is `state-database`, the conservative
 * choice). `inventory.test.ts` fails if a tier 1 id here no longer exists in the route table.
 */

export type Tier = 1 | 2;

/**
 * What a request to the route changes.
 *
 * - `read-only`: no change anywhere (safe to run repeatedly, including POST verifiers).
 * - `state-database`: writes to Studio's own database (keys, issued credentials, provider config).
 * - `ledger-fee`: writes to the cheqd ledger and pays a network fee from the customer's account.
 * - `faucet`: sends testnet CHEQ to an address; rate limited and capped per customer per month.
 * - `billing`: touches Stripe (checkout, subscriptions, webhook). Never run by the recorder.
 */
export type SideEffect = 'read-only' | 'state-database' | 'ledger-fee' | 'faucet' | 'billing';

/** Route ids use the Express form: `METHOD /path/:param`. */
export const TIER_1_IDS: readonly string[] = [
	'POST /account/faucet',
	'GET /account/balances',
	'POST /account/create',
	// Encrypted status lists carry payment conditions (fee payment address, amount and window).
	'POST /credential-status/create/encrypted',
	'POST /credential-status/update/encrypted',
];

/** Every route under these prefixes is money-related (Stripe billing) and therefore tier 1. */
export const TIER_1_PREFIXES: readonly string[] = [
	'/admin/subscription/',
	'/admin/checkout/',
	'/admin/price/',
	'/admin/product/',
	'/admin/webhook',
];

export const SIDE_EFFECT_OVERRIDES: Readonly<Record<string, SideEffect>> = {
	// Read-only despite being POST.
	'POST /credential/verify': 'read-only',
	'POST /presentation/verify': 'read-only',
	'POST /credential-status/check': 'read-only',
	'POST /trust-registry/accreditation/verify': 'read-only',

	// Ledger writes (network fee from the customer's account).
	'POST /did/create': 'ledger-fee',
	'POST /did/update': 'ledger-fee',
	'POST /did/deactivate/:did': 'ledger-fee',
	'POST /resource/create/:did': 'ledger-fee',
	'POST /credential-status/create/unencrypted': 'ledger-fee',
	'POST /credential-status/create/encrypted': 'ledger-fee',
	'POST /credential-status/update/unencrypted': 'ledger-fee',
	'POST /credential-status/update/encrypted': 'ledger-fee',
	'POST /credential/revoke': 'ledger-fee',
	'POST /credential/suspend': 'ledger-fee',
	'POST /credential/reinstate': 'ledger-fee',
	'POST /trust-registry/accreditation/issue': 'ledger-fee',
	'POST /trust-registry/accreditation/revoke': 'ledger-fee',
	'POST /trust-registry/accreditation/suspend': 'ledger-fee',
	'POST /trust-registry/accreditation/reinstate': 'ledger-fee',

	'POST /account/faucet': 'faucet',

	'POST /admin/subscription/create': 'billing',
	'POST /admin/subscription/update': 'billing',
	'DELETE /admin/subscription/cancel': 'billing',
	'POST /admin/subscription/resume': 'billing',
	'POST /admin/webhook': 'billing',
};

/** Routes whose responses can contain private key material. Fixtures must never store these bodies raw. */
export const SENSITIVE_IDS: readonly string[] = ['POST /did/export/:did', 'GET /key/read/:kid', 'POST /key/create'];

/**
 * Routes that are in the Express route table but are not part of the public API contract:
 * redirects, static assets, the identity-provider webhook and the session echo.
 */
export const INTERNAL_IDS: readonly string[] = [
	'GET /',
	'GET /static/custom-button.js',
	'POST /account/bootstrap',
	'GET /auth/user-info',
];

export function tierFor(id: string): Tier {
	if (TIER_1_IDS.includes(id)) return 1;
	const path = id.slice(id.indexOf(' ') + 1);
	return TIER_1_PREFIXES.some((p) => path.startsWith(p)) ? 1 : 2;
}

export function sideEffectFor(id: string): SideEffect {
	const override = SIDE_EFFECT_OVERRIDES[id];
	if (override) return override;
	return id.startsWith('GET ') ? 'read-only' : 'state-database';
}
