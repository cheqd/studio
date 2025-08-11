import { AuthRuleProvider } from '../auth-rule-provider.js';

export class EventAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/event', 'GET', 'list:event:testnet', { skipNamespace: true });
		this.registerRule('/event', 'GET', 'list:event:mainnet', { skipNamespace: true });
	}
}
