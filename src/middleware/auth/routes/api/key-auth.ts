import { AuthRuleProvider } from '../auth-rule-provider.js';

export class KeyAuthProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/key/create', 'POST', 'create:key', { skipNamespace: true });
		this.registerRule('/key/import', 'POST', 'import:key', { skipNamespace: true });
		this.registerRule('/key/read/(.*)', 'GET', 'read:key', { skipNamespace: true });
		this.registerRule('/key/list', 'GET', 'list:key', { skipNamespace: true });
		this.registerRule('/key/(.*)/verification-method', 'GET', 'read:key', { skipNamespace: true });
	}
}
