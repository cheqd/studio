import { AuthRuleProvider } from '../../auth-rule-provider.js';

export class AdminAuthRuleProvider extends AuthRuleProvider {
	/**
	 * Constructor for the AdminHandler class. Registers various routes related to admin functionalities like swagger, subscriptions, prices, products, and API keys for different environments.
	 */
	constructor() {
		super();
		// Main swagger route
		this.registerRule('/admin/swagger', 'GET', 'admin:swagger:testnet', { skipNamespace: true });
		this.registerRule('/admin/swagger', 'GET', 'admin:swagger:mainnet', { skipNamespace: true });
		// Subscriptions
		// skipNamespace is set to true cause we don't have the information about the namespace in the request
		this.registerRule('/admin/subscription/create', 'POST', 'admin:subscription:create:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/create', 'POST', 'admin:subscription:create:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/list', 'GET', 'admin:subscription:list:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/list', 'GET', 'admin:subscription:list:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/update', 'POST', 'admin:subscription:update:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/update', 'POST', 'admin:subscription:update:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/cancel', 'POST', 'admin:subscription:cancel:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/cancel', 'POST', 'admin:subscription:cancel:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/resume', 'POST', 'admin:subscription:resume:testnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/resume', 'POST', 'admin:subscription:resume:mainnet', {
			skipNamespace: true,
		});
		this.registerRule('/admin/subscription/get', 'GET', 'admin:subscription:get:testnet', { skipNamespace: true });
		this.registerRule('/admin/subscription/get', 'GET', 'admin:subscription:get:mainnet', { skipNamespace: true });
		// Prices
		this.registerRule('/admin/price/list', 'GET', 'admin:price:list:testnet', { skipNamespace: true });
		this.registerRule('/admin/price/list', 'GET', 'admin:price:list:mainnet', { skipNamespace: true });

		// Products
		this.registerRule('/admin/product/list', 'GET', 'admin:product:list:testnet', { skipNamespace: true });
		this.registerRule('/admin/product/list', 'GET', 'admin:product:list:mainnet', { skipNamespace: true });
		this.registerRule('/admin/product/get', 'GET', 'admin:product:get:testnet', { skipNamespace: true });
		this.registerRule('/admin/product/get', 'GET', 'admin:product:get:mainnet', { skipNamespace: true });
		// API Key
		this.registerRule('/admin/api-key/create', 'POST', 'admin:api-key:create:testnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/create', 'POST', 'admin:api-key:create:mainnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/update', 'POST', 'admin:api-key:update:testnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/update', 'POST', 'admin:api-key:update:mainnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/revoke', 'DELETE', 'admin:api-key:revoke:testnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/revoke', 'DELETE', 'admin:api-key:revoke:mainnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/get', 'GET', 'admin:api-key:get:testnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/get', 'GET', 'admin:api-key:get:mainnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/list', 'GET', 'admin:api-key:list:testnet', { skipNamespace: true });
		this.registerRule('/admin/api-key/list', 'GET', 'admin:api-key:list:mainnet', { skipNamespace: true });
	}
}
