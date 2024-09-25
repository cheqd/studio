import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AccreditationAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/accreditation/issue', 'POST', 'issue:accreditation:testnet');
		this.registerRule('/accreditation/verify', 'POST', 'verify:accreditation:testnet');
	}
}
