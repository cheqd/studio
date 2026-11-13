import { AuthRuleProvider } from '../auth-rule-provider.js';

export class FlagsAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		// Anchored: route matching is a substring regex, so an unanchored '/flags' would also match '/admin/flags'.
		this.registerRule('^/flags$', 'GET', 'read:flags', { skipNamespace: true });
	}
}
