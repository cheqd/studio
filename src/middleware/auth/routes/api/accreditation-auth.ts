import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AccreditationAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/trust-registry/accreditation/issue', 'POST', 'issue:accreditation:testnet');
		this.registerRule('/trust-registry/accreditation/verify', 'POST', 'verify:accreditation:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/trust-registry/accreditation/issue', 'POST', 'issue:accreditation:mainnet');
		this.registerRule('/trust-registry/accreditation/verify', 'POST', 'verify:accreditation:mainnet', {
			skipNamespace: true,
		});
	}
}
