import { AuthRuleProvider } from '../auth-rule-provider.js';

export class CredentialAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/credential/issue', 'POST', 'issue:credential:testnet');
		this.registerRule('/credential/issue', 'POST', 'issue:credential:mainnet');
		this.registerRule('/credential/list', 'GET', 'list:credential:testnet', { skipNamespace: true });
		this.registerRule('/credential/list', 'GET', 'list:credential:mainnet', { skipNamespace: true });
		this.registerRule('/credential/revoke', 'POST', 'revoke:credential:testnet');
		this.registerRule('/credential/revoke', 'POST', 'revoke:credential:mainnet');
		this.registerRule('/credential/suspend', 'POST', 'suspend:credential:testnet');
		this.registerRule('/credential/suspend', 'POST', 'suspend:credential:mainnet');
		this.registerRule('/credential/reinstate', 'POST', 'reinstate:credential:testnet');
		this.registerRule('/credential/reinstate', 'POST', 'reinstate:credential:mainnet');
		// Issued Credentials Tracking API
		this.registerRule('/credentials/issued', 'GET', 'list:credential:testnet', { skipNamespace: true });
		this.registerRule('/credentials/issued', 'GET', 'list:credential:mainnet', { skipNamespace: true });
		this.registerRule('/credentials/issued/(.*)', 'GET', 'list:credential:testnet', { skipNamespace: true });
		this.registerRule('/credentials/issued/(.*)', 'GET', 'list:credential:mainnet', { skipNamespace: true });
		this.registerRule('/credentials/issued/(.*)', 'PUT', 'update:credential:testnet', { skipNamespace: true });
		this.registerRule('/credentials/issued/(.*)', 'PUT', 'update:credential:mainnet', { skipNamespace: true });
		this.registerRule('/credentials/issued/(.*)/re-issue', 'POST', 'update:credential:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/credentials/issued/(.*)/re-issue', 'POST', 'update:credential:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/credential/verify', 'POST', 'verify:credential:testnet', { skipNamespace: true });
		this.registerRule('/credential/verify', 'POST', 'verify:credential:mainnet', { skipNamespace: true });
	}
}
