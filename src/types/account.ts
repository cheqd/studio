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
