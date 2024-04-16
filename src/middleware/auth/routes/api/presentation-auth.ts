import { AuthRuleProvider } from "../auth-rule-provider.js";

export class PresentationAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		// Unauthorized routes
		this.registerRule('/presentation/verify', 'POST', 'verify:presentation', { skipNamespace: true });
		this.registerRule('/presentation/create', 'POST', 'create:presentation', { skipNamespace: true });
	}
}
