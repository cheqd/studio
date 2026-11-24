// src/middleware/auth/routes/api/providers-auth.ts
import { AuthRuleProvider } from '../auth-rule-provider.js';

export class ProvidersAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();

		// Provider management rules
		this.registerRule('^/providers$', 'GET', 'list:providers:testnet', { skipNamespace: true });
		this.registerRule('^/providers$', 'GET', 'list:providers:mainnet', { skipNamespace: true });

		// These two GET rules skip the namespace: before the rules were anchored, the '/providers' GET rule above
		// matched these paths first, so that is how they have always been authorised.
		this.registerRule('^/providers/activated$', 'GET', 'list:providers:testnet', { skipNamespace: true });
		this.registerRule('^/providers/activated$', 'GET', 'list:providers:mainnet', { skipNamespace: true });

		this.registerRule('^/providers/[^/]+/activate$', 'POST', 'configure:providers:testnet', {
			skipNamespace: true,
		});
		this.registerRule('^/providers/[^/]+/activate$', 'POST', 'configure:providers:mainnet', {
			skipNamespace: true,
		});

		this.registerRule('^/providers/[^/]+/configuration$', 'GET', 'list:providers:testnet', { skipNamespace: true });
		this.registerRule('^/providers/[^/]+/configuration$', 'GET', 'list:providers:mainnet', { skipNamespace: true });

		this.registerRule('^/providers/[^/]+/configuration$', 'PUT', 'configure:providers:testnet', {
			skipNamespace: true,
		});
		this.registerRule('^/providers/[^/]+/configuration$', 'PUT', 'configure:providers:mainnet', {
			skipNamespace: true,
		});
		// Before the rules were anchored, the '/did/import' rules matched this path first, so it has always needed the
		// import:did scope for the DID's network. Kept as it was.
		this.registerRule('^/providers/[^/]+/did/import$', 'POST', 'import:did:testnet');
		this.registerRule('^/providers/[^/]+/did/import$', 'POST', 'import:did:mainnet');

		this.registerRule('^/providers/[^/]+/test$', 'POST', 'configure:providers:testnet', { skipNamespace: true });
		this.registerRule('^/providers/[^/]+/test$', 'POST', 'configure:providers:mainnet', { skipNamespace: true });

		this.registerRule('^/providers/[^/]+$', 'DELETE', 'delete:providers:testnet', { skipNamespace: true });
		this.registerRule('^/providers/[^/]+$', 'DELETE', 'delete:providers:mainnet', { skipNamespace: true });
	}
}
