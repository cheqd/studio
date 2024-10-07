import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AccreditationAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('/trust-registry/accreditation/issue', 'POST', 'issue-accreditation:trust-registry:testnet');
		this.registerRule(
			'/trust-registry/accreditation/verify',
			'POST',
			'verify-accreditation:trust-registry:testnet',
			{
				skipNamespace: true,
			}
		);
		this.registerRule('/trust-registry/accreditation/issue', 'POST', 'issue-accreditation:trust-registry:mainnet');
		this.registerRule(
			'/trust-registry/accreditation/verify',
			'POST',
			'verify-accreditation:trust-registry:mainnet',
			{
				skipNamespace: true,
			}
		);
	}
}
