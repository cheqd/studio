import { AuthRuleProvider } from '../auth-rule-provider.js';

export class RecordAuthProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/record/search', 'GET', 'read:account', { skipNamespace: true });
		this.registerRule('/record/publish', 'POST', 'create:account', { skipNamespace: true });
		this.registerRule('/record/(.*)', 'GET', 'read:account', { skipNamespace: true });
	}
}
