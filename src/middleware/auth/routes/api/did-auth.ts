import { AuthRuleProvider } from '../auth-rule-provider.js';

export class DidAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/did/create', 'POST', 'create:did:testnet');
		this.registerRule('/did/create', 'POST', 'create:did:mainnet');
		this.registerRule('/did/list', 'GET', 'list:did:testnet', { skipNamespace: true });
		this.registerRule('/did/list', 'GET', 'list:did:mainnet', { skipNamespace: true });
		this.registerRule('/did/update', 'POST', 'update:did:testnet');
		this.registerRule('/did/update', 'POST', 'update:did:mainnet');
		this.registerRule('/did/deactivate', 'POST', 'deactivate:did:testnet');
		this.registerRule('/did/deactivate', 'POST', 'deactivate:did:mainnet');
		this.registerRule('/did/import', 'POST', 'import:did:testnet');
		this.registerRule('/did/import', 'POST', 'import:did:mainnet');
		this.registerRule('/did/export', 'POST', 'export:did:testnet');
		this.registerRule('/did/export', 'POST', 'export:did:mainnet');
		// Unauthorized routes
		this.registerRule('/did/search/(.*)', 'GET', '', { allowUnauthorized: true, skipNamespace: true });
	}
}
