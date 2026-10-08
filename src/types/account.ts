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

export interface AccountFaucetInfo {
	// Most CHEQ the testnet address can hold, and the most the customer can request per month.
	cap: { cheq: number; ncheq: string };
	quota: {
		period: 'month';
		limit: { cheq: number; ncheq: string };
		used: { cheq: number; ncheq: string };
		remaining: { cheq: number; ncheq: string };
		resetsAt: string;
	};
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
