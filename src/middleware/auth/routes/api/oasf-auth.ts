import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AgntcyAuthProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/oasf/search', 'GET', 'read:oasf', { skipNamespace: true, allowUnauthorized: true });
		this.registerRule('/oasf/(.*)', 'GET', 'read:oasf', { skipNamespace: true, allowUnauthorized: true });
		this.registerRule('/oasf/publish', 'POST', 'create:oasf', { skipNamespace: true });
	}
}
