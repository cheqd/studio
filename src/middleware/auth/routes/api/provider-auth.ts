// src/middleware/auth/routes/api/providers-auth.ts
import { AuthRuleProvider } from '../auth-rule-provider.js';

export class ProvidersAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();

		// Provider management rules
		this.registerRule('/providers', 'GET', 'list:providers:testnet', { skipNamespace: true });
		this.registerRule('/providers', 'GET', 'list:providers:mainnet', { skipNamespace: true });

		this.registerRule('/providers/activated', 'GET', 'list:providers:testnet');
		this.registerRule('/providers/activated', 'GET', 'list:providers:mainnet');

		this.registerRule('/providers/(.*)/activate', 'POST', 'configure:providers:testnet', { skipNamespace: true });
		this.registerRule('/providers/(.*)/activate', 'POST', 'configure:providers:mainnet', { skipNamespace: true });

		this.registerRule('/providers/(.*)/configuration', 'GET', 'list:providers:testnet');
		this.registerRule('/providers/(.*)/configuration', 'GET', 'list:providers:mainnet');

		this.registerRule('/providers/(.*)/configuration', 'PUT', 'configure:providers:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/providers/(.*)/configuration', 'PUT', 'configure:providers:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/providers/(.*)/did/import', 'POST', 'configure:providers:mainnet');
		this.registerRule('/providers/(.*)/did/import', 'POST', 'configure:providers:mainnet');

		this.registerRule('/providers/(.*)/test', 'POST', 'configure:providers:testnet', { skipNamespace: true });
		this.registerRule('/providers/(.*)/test', 'POST', 'configure:providers:mainnet', { skipNamespace: true });

		this.registerRule('/providers/(.*)', 'DELETE', 'delete:providers:testnet', { skipNamespace: true });
		this.registerRule('/providers/(.*)', 'DELETE', 'delete:providers:mainnet', { skipNamespace: true });
	}
}
