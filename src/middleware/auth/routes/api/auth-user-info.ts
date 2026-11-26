import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AuthInfoProvider extends AuthRuleProvider {
	constructor() {
		super();
		// Public by decision (F-12): the Swagger UI calls it before sign-in. Without a session it returns only
		// { isAuthenticated: false } (see user-info-route.ts).
		this.registerRule('^/auth/user-info$', 'GET', '', { skipNamespace: true, allowUnauthorized: true });
	}
}
