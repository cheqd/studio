import { AuthRuleProvider } from "../../auth-rule-provider.js";

export class CredentialAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/credential/issue', 'POST', 'issue:credential:testnet');
		this.registerRule('/credential/issue', 'POST', 'issue:credential:mainnet');
		this.registerRule('/credential/revoke', 'POST', 'revoke:credential:testnet');
		this.registerRule('/credential/revoke', 'POST', 'revoke:credential:mainnet');
		this.registerRule('/credential/suspend', 'POST', 'suspend:credential:testnet');
		this.registerRule('/credential/suspend', 'POST', 'suspend:credential:mainnet');
		this.registerRule('/credential/reinstate', 'POST', 'reinstate:credential:testnet');
		this.registerRule('/credential/reinstate', 'POST', 'reinstate:credential:mainnet');
		// Unauthorized routes
		this.registerRule('/credential/verify', 'POST', '', { allowUnauthorized: true, skipNamespace: true });
	}
}
