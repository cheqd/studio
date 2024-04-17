import { AuthRule, AuthRuleOptions } from '../../../types/authentication.js';
import type { Request } from 'express';

export interface IAuthRuleProvider {
	push(methodToScopeRule: AuthRule): void;
	match(request: Request): AuthRule | null;
}

export class AuthRuleProvider implements IAuthRuleProvider {
	protected rules: AuthRule[] = [];

	/**
	 * Adds a new methodToScopeRule to the ruleList.
	 *
	 * @param {AuthRule} methodToScopeRule - The methodToScopeRule to push.
	 * @return {void}
	 */
	public push(methodToScopeRule: AuthRule): void {
		this.rules.push(methodToScopeRule);
	}

	/**
	 * Registers a new route with the specified method, scope, and options.
	 *
	 * @param {string} route - The route to register.
	 * @param {string} method - The HTTP method for the route.
	 * @param {string} scope - The scope associated with the route.
	 * @param {Object} options - (Optional) Additional options for the route registration.
	 */
	protected registerRule(route: string, method: string, scope: string, options?: AuthRuleOptions): void {
		this.push(new AuthRule(route, method, scope, options));
	}

	/**
	 * Matches the request against the rules and returns the matching rule, if found.
	 *
	 * @param {Request} request - The request to match against the rules.
	 * @return {AuthRule | null} The matching rule, if found; otherwise, null.
	 */
	public match(request: Request): AuthRule | null {
		for (const rule of this.rules) {
			if (rule.match(request)) {
				return rule;
			}
		}
		return null;
	}
}
