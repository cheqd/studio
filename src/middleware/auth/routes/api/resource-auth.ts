import { AuthRuleProvider } from '../auth-rule-provider.js';

export class ResourceAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('^/resource/create/[^/]+$', 'POST', 'create:resource:testnet');
		this.registerRule('^/resource/create/[^/]+$', 'POST', 'create:resource:mainnet');
		this.registerRule('^/resource/list$', 'GET', 'list:resource:testnet', { skipNamespace: true });
		this.registerRule('^/resource/list$', 'GET', 'list:resource:mainnet', { skipNamespace: true });

		// Public by decision (F-12): a lookup of public ledger data. No API key; the per-IP rate limit applies.
		this.registerRule('^/resource/search/[^/]+$', 'GET', '', { allowUnauthorized: true, skipNamespace: true });
	}
}
