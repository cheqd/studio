export interface BootStrapAccountResponse {
	customerCreated: boolean;
	userCreated: boolean;
	customerAssignedToUser: boolean;
	mainnetAccountProvisioned: boolean;
	testnetAccountProvisioned: boolean;
	customDataUpdated: boolean;
	testnetMinimumBalance: boolean;
	stripeAccountCreated: boolean;
	error?: string[];
}

export const BootStrapAccountResponse = {
	initialize() {
		return {
			customerCreated: false,
			userCreated: false,
			customerAssignedToUser: false,
			mainnetAccountProvisioned: false,
			testnetAccountProvisioned: false,
			customDataUpdated: false,
			testnetMinimumBalance: false,
			stripeAccountCreated: false,
		} as BootStrapAccountResponse;
	},
};
