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
		this.registerRule('^/agents/[^/]+/authority$', 'POST', 'issue:agent-authority', { skipNamespace: true });
		this.registerRule('^/agents/[^/]+/authority/[^/]+$', 'DELETE', 'revoke:agent-authority', {
			skipNamespace: true,
		});
		this.registerRule('^/verify/agent$', 'POST', 'verify:agent', { skipNamespace: true });
	}
}
