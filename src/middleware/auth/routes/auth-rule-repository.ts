import type { AuthRuleProvider } from "./auth-rule-provider.js";

import type { Request } from "express";
import type { AuthRule } from "../../../types/authentication.js";


export class AuthRuleRepository {
    private providers: AuthRuleProvider[] = [];
    /**
     * Adds a new provider to the providers list.
     *
     * @param {AuthRuleProvider} provider - The provider to push.
     * @return {void}
     */
    public push(provider: AuthRuleProvider): void {
        this.providers.push(provider);
    }

    /**
     * Matches the request against the rules and returns the matching rule, if found.
     *
     * @param {Request} request - The request to match against the rules.
     * @return {AuthRule | null} The matching rule, if found; otherwise, null.
     */
    public match(request: Request): AuthRule | null {
        for (const provider of this.providers) {
            const rule = provider.match(request);
            if (rule) {
                return rule;
            }
        }
        return null;
    }
}
