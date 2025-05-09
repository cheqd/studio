export interface BootStrapAccountResponse {
	customerCreated: boolean;
	userCreated: boolean;
	customerAssignedToUser: boolean;
	mainnetAccountProvisioned: boolean;
	testnetAccountProvisioned: boolean;
	customDataUpdated: boolean;
	testnetMinimumBalance: boolean;
	stripeAccountCreated: boolean;
}
