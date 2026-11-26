import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AccountAuthProvider extends AuthRuleProvider {
	constructor() {
		super();
		// Every rule is anchored (^...$), so a rule only ever matches its own path.
		// Customer analytics for the portal's Analytics page.
		this.registerRule('^/account/analytics/(agents|individuals|ledger)$', 'GET', 'read:account', {
			skipNamespace: true,
		});
		this.registerRule('^/account$', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('^/account/faucet$', 'POST', 'request:faucet:testnet', { skipNamespace: true });
		this.registerRule('^/account/export-keys$', 'POST', 'export:account:keys', { skipNamespace: true });
		this.registerRule('^/account/create$', 'POST', 'create:account', { skipNamespace: true });
		this.registerRule('^/account/idtoken$', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('^/account/analytics$', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('^/account/balances$', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('^/account$', 'DELETE', 'delete:account', { skipNamespace: true });
	}
}
