import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AuthInfoProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/auth/user-info', 'GET', '', { skipNamespace: true, allowUnauthorized: true });
	}
}
