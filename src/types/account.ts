export interface BootStrapAccountResponse {
	customerInitialized: boolean;
	mainnetAccountProvisioned: boolean;
	testnetAccountProvisioned: boolean;
	customDataUpdated: boolean;
	testnetMinimumBalance: boolean;
	stripeAccountCreated: boolean;
	errors: string[];
}

export const BootStrapAccountResponse = {
	initialize() {
		return {
			customerInitialized: false,
			mainnetAccountProvisioned: false,
			testnetAccountProvisioned: false,
			customDataUpdated: false,
			testnetMinimumBalance: false,
			stripeAccountCreated: false,
			errors: [],
		} as BootStrapAccountResponse;
	},
};

// GET /account/balances

export interface AccountNetworkBalance {
	address: string;
	denom: string;
	// `null` when the on-chain balance query failed for this network (the address is still returned).
	balance: { ncheq: string; cheq: number } | null;
	// `cheq * rate.cheqUsd`; `null` when the balance or the CHEQ/USD rate is unavailable.
	usd: number | null;
}

export interface FaucetAmountSummary {
	cheq: number;
	ncheq: string;
}

export interface FaucetQuotaSummary {
	period: 'month';
	limit: FaucetAmountSummary;
	used: FaucetAmountSummary;
	remaining: FaucetAmountSummary;
	// ISO timestamp at which the monthly quota resets.
	resetsAt: string;
}

export interface AccountFaucetInfo {
	// Most CHEQ a testnet address can hold.
	cap: FaucetAmountSummary;
	quota: FaucetQuotaSummary;
}

export interface QueryAccountBalancesResponseBody {
	// `null` when the customer has no payment account on that network.
	mainnet: AccountNetworkBalance | null;
	testnet: AccountNetworkBalance | null;
	// Faucet cap and the customer's monthly quota usage; `null` when there is no testnet account or it could not be read.
	faucet: AccountFaucetInfo | null;
	// `null` when the CHEQ/USD rate could not be fetched.
	rate: { cheqUsd: number; source: 'coingecko'; asOf: string } | null;
}
