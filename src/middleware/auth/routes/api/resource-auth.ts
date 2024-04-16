import { AuthRuleProvider } from "../auth-rule-provider.js";

export class ResourceAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/resource/create', 'POST', 'create:resource:testnet');
		this.registerRule('/resource/create', 'POST', 'create:resource:mainnet');
		// Unauthorized routes
		this.registerRule('/resource/search/(.*)', 'GET', '', { allowUnauthorized: true, skipNamespace: true });
	}
}
