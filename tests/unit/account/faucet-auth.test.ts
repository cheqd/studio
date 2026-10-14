import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { AccountAuthProvider } from '../../../src/middleware/auth/routes/api/account-auth.js';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';

/**
 * POST /account/faucet can be called with a Studio user session, an API key (`x-api-key`) or a machine-to-machine
 * token (bearer token plus a `customer-id` header). The auth guard picks the strategy from the headers, and every
 * strategy ends in the same place: the scopes it resolved are checked against the route's rule. These tests pin that
 * rule, so the endpoint is only reachable with the faucet scope whichever credential is used.
 */
describe('POST /account/faucet auth rule', () => {
	const repository = new AuthRuleRepository();
	repository.push(new AccountAuthProvider());
	const requestFor = (method: string, path: string) => ({ method, path }) as unknown as Request;

	it('requires the request:faucet:testnet scope', () => {
		const rule = repository.match(requestFor('POST', '/account/faucet'));
		expect(rule).not.toBeNull();
		expect(rule?.isValidScope('request:faucet:testnet')).toBe(true);
		expect(rule?.areValidScopes(['read:account', 'request:faucet:testnet'])).toBe(true);
	});

	it('rejects credentials that lack the scope, including other account scopes', () => {
		const rule = repository.match(requestFor('POST', '/account/faucet'));
		expect(rule?.areValidScopes([])).toBe(false);
		expect(rule?.areValidScopes(['read:account', 'create:account'])).toBe(false);
		expect(rule?.areValidScopes(['create:did:testnet'])).toBe(false);
	});

	it('is not open to unauthenticated callers', () => {
		const rule = repository.match(requestFor('POST', '/account/faucet'));
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});

	it('is specific to POST: the faucet rule is not what governs other methods on the path', () => {
		// GET /account/faucet has no handler; the router matches it against the existing GET /account rule
		const rule = repository.match(requestFor('GET', '/account/faucet'));
		expect(rule?.isValidScope('request:faucet:testnet') ?? false).toBe(false);
	});
});
