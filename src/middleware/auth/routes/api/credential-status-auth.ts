import { AuthRuleProvider } from '../auth-rule-provider.js';

export class CredentialStatusAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/credential-status/create/encrypted', 'POST', 'create-encrypted:credential-status:testnet');
		this.registerRule('/credential-status/create/encrypted', 'POST', 'create-encrypted:credential-status:mainnet');
		this.registerRule(
			'/credential-status/create/unencrypted',
			'POST',
			'create-unencrypted:credential-status:testnet'
		);
		this.registerRule(
			'/credential-status/create/unencrypted',
			'POST',
			'create-unencrypted:credential-status:mainnet'
		);
		this.registerRule('/credential-status/publish', 'POST', 'publish:credential-status:testnet');
		this.registerRule('/credential-status/publish', 'POST', 'publish:credential-status:mainnet');
		this.registerRule('/credential-status/update/encrypted', 'POST', 'update-encrypted:credential-status:testnet');
		this.registerRule('/credential-status/update/encrypted', 'POST', 'update-encrypted:credential-status:mainnet');
		this.registerRule(
			'/credential-status/update/unencrypted',
			'POST',
			'update-unencrypted:credential-status:testnet'
		);
		this.registerRule(
			'/credential-status/update/unencrypted',
			'POST',
			'update-unencrypted:credential-status:mainnet'
		);
		// Unauthorized routes
		this.registerRule('/credential-status/search', 'GET', '', { allowUnauthorized: true, skipNamespace: true });
		this.registerRule('/credential-status/check', 'POST', 'check:credential-status', { skipNamespace: true });
	}
}
