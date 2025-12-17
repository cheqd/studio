import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AccountAuthProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/account', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/account', 'POST', 'create:account', { skipNamespace: true });
		this.registerRule('/account/idtoken', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/account/analytics', 'GET', 'read:account', { skipNamespace: true });
	}
}
