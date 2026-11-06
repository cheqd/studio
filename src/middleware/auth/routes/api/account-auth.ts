import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AccountAuthProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/account', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/account/faucet', 'POST', 'request:faucet:testnet', { skipNamespace: true });
		// Registered before the generic '/account' POST rule below: route matching is a substring regex,
		// so '/account' would otherwise match '/account/export-keys' first and apply create:account to it.
		this.registerRule('/account/export-keys', 'POST', 'export:account:keys', { skipNamespace: true });
		this.registerRule('/account', 'POST', 'create:account', { skipNamespace: true });
		this.registerRule('/account/idtoken', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/account/analytics', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/account/balances', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/account', 'DELETE', 'delete:account', { skipNamespace: true });
	}
}
