import { AuthRuleProvider } from '../auth-rule-provider.js';

/**
 * Agent endpoints. Every rule is anchored (`^...$`): rule matching is a substring regex, so an unanchored
 * '/agents' would also match '/admin/agents' or '/did/agents', and '/agents/(.*)' would swallow the card and
 * authority routes before their own rules. Network-agnostic scopes (`skipNamespace`), like the key routes: the
 * agent routes carry no network in the path, and the network of a new agent is a body field the guard does not
 * read for these paths.
 *
 * The scopes below must exist in Logto and be attached to the customer roles before the routes are usable.
 */
export class AgentAuthRuleProvider extends AuthRuleProvider {
	constructor() {
		super();
		this.registerRule('^/agents$', 'POST', 'create:agent', { skipNamespace: true });
		this.registerRule('^/agents$', 'GET', 'list:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+$', 'GET', 'read:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+$', 'PATCH', 'update:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+$', 'DELETE', 'delete:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/card$', 'POST', 'create:agent-card', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/card$', 'GET', 'read:agent-card', { skipNamespace: true });
		// Listing grants reads the agent, so it uses the existing read:agent scope (no new Logto scope to provision)
		this.registerRule('^/agents/[^/]+/authority$', 'GET', 'read:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/authority$', 'POST', 'issue:agent-authority', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/authority/[^/]+$', 'DELETE', 'revoke:agent-authority', {
			skipNamespace: true,
		});
		// Changing a grant's expiry issues a replacement credential, so it needs the same scope as granting.
		this.registerRule('^/agents/[^/]+/authority/[^/]+$', 'PATCH', 'issue:agent-authority', {
			skipNamespace: true,
		});
		// Keys: reading uses read:agent; adding and rotating change the agent's DID, so they use update:agent.
		// No new Logto scope to provision.
		this.registerRule('^/agents/[^/]+/keys$', 'GET', 'read:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/keys$', 'POST', 'update:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/keys/rotate$', 'POST', 'update:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/activity$', 'GET', 'read:agent', { skipNamespace: true });
		// x402, Proposed. Reading uses read:agent (no new Logto scope); binding and revoking need their own.
		this.registerRule('^/agents/[^/]+/payment-addresses$', 'GET', 'read:agent', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/payment-addresses$', 'POST', 'issue:agent-payment-address', {
			skipNamespace: true,
		});
		this.registerRule('^/agents/[^/]+/payment-addresses/[^/]+$', 'DELETE', 'revoke:agent-payment-address', {
			skipNamespace: true,
		});
		this.registerRule('^/agents/[^/]+/settlement$', 'GET', 'read:agent', { skipNamespace: true });
	}
}
