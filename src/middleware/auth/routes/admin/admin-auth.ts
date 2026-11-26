import { AuthRuleProvider } from '../auth-rule-provider.js';

export class AdminAuthRuleProvider extends AuthRuleProvider {
	/**
	 * Constructor for the AdminHandler class. Registers various routes related to admin functionalities like swagger, subscriptions, prices, products, and API keys for different environments.
	 */
	constructor() {
		super();
		// Main swagger route
		this.registerRule('^/admin/swagger$', 'GET', 'admin:swagger', { skipNamespace: true });
		// Subscriptions
		// skipNamespace is set to true cause we don't have the information about the namespace in the request
		this.registerRule('^/admin/subscription/create$', 'POST', 'admin:subscription:create', {
			skipNamespace: true,
		});
		this.registerRule('^/admin/subscription/list$', 'GET', 'admin:subscription:list', {
			skipNamespace: true,
		});
		this.registerRule('^/admin/subscription/update$', 'POST', 'admin:subscription:update', {
			skipNamespace: true,
		});
		this.registerRule('^/admin/subscription/cancel$', 'DELETE', 'admin:subscription:cancel', {
			skipNamespace: true,
		});
		this.registerRule('^/admin/subscription/resume$', 'POST', 'admin:subscription:resume', {
			skipNamespace: true,
		});
		this.registerRule('^/admin/subscription/get$', 'GET', 'admin:subscription:get', { skipNamespace: true });
		this.registerRule('^/admin/checkout/session/[^/]+$', 'GET', 'admin:subscription:get', { skipNamespace: true });
		// Prices
		this.registerRule('^/admin/price/list$', 'GET', 'admin:price:list', { skipNamespace: true });

		// Products
		this.registerRule('^/admin/product/list$', 'GET', 'admin:product:list', { skipNamespace: true });
		this.registerRule('^/admin/product/get/[^/]+$', 'GET', 'admin:product:get', { skipNamespace: true });
		// API Key
		this.registerRule('^/admin/api-key/create$', 'POST', 'admin:api-key:create', { skipNamespace: true });
		this.registerRule('^/admin/api-key/update$', 'POST', 'admin:api-key:update', { skipNamespace: true });
		this.registerRule('^/admin/api-key/revoke$', 'DELETE', 'admin:api-key:revoke', { skipNamespace: true });
		this.registerRule('^/admin/api-key/get$', 'GET', 'admin:api-key:get', { skipNamespace: true });
		this.registerRule('^/admin/api-key/list$', 'GET', 'admin:api-key:list', { skipNamespace: true });
		// Feature flags (staff only). Anchored so that no other rule can match this path.
		this.registerRule('^/admin/flags$', 'PUT', 'admin:flags:update', { skipNamespace: true });
		this.registerRule('^/admin/customers/[^/]+/flags$', 'GET', 'admin:customers:read', { skipNamespace: true });
		// Staff customer back end, analytics and audit log. Read only, anchored so no other rule can match these paths.
		this.registerRule('^/admin/customers$', 'GET', 'admin:customers:read', { skipNamespace: true });
		this.registerRule('^/admin/customers/[^/]+$', 'GET', 'admin:customers:read', { skipNamespace: true });
		// Reveals one customer's full email; audited by the handler
		this.registerRule('^/admin/customers/[^/]+/email-reveal$', 'POST', 'admin:customers:read', {
			skipNamespace: true,
		});
		this.registerRule(
			'^/admin/analytics/(overview|endpoints|top-accounts|plan-mix|funnels|funnels/stalled|faucet-to-ledger|ledger-writes)$',
			'GET',
			'admin:analytics:read',
			{ skipNamespace: true }
		);
		this.registerRule('^/admin/audit-log$', 'GET', 'admin:audit:read', { skipNamespace: true });
		// Customer
		this.registerRule('^/admin/organisation/update$', 'POST', 'admin:organisation:update', { skipNamespace: true });
		this.registerRule('^/admin/organisation/get$', 'GET', 'admin:organisation:get', { skipNamespace: true });
		this.registerRule('^/admin/organisation/delete$', 'DELETE', 'admin:organisation:delete', {
			skipNamespace: true,
		});
	}
}
