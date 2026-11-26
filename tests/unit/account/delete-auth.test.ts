import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { AccountAuthProvider } from '../../../src/middleware/auth/routes/api/account-auth.js';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';

describe('DELETE /account auth rule', () => {
	const repository = new AuthRuleRepository();
	repository.push(new AccountAuthProvider());
	const requestFor = (method: string, path: string) => ({ method, path }) as unknown as Request;

	it('requires the delete:account scope', () => {
		const rule = repository.match(requestFor('DELETE', '/account'));
		expect(rule).not.toBeNull();
		expect(rule?.isValidScope('delete:account')).toBe(true);
	});

	it('rejects credentials that lack the scope, including other account scopes', () => {
		const rule = repository.match(requestFor('DELETE', '/account'));
		expect(rule?.areValidScopes([])).toBe(false);
		expect(rule?.areValidScopes(['read:account', 'create:account'])).toBe(false);
	});

	it('is not open to unauthenticated callers', () => {
		const rule = repository.match(requestFor('DELETE', '/account'));
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});

	it('is specific to DELETE: the delete rule is not what governs GET on the same path', () => {
		const rule = repository.match(requestFor('GET', '/account'));
		expect(rule?.isValidScope('delete:account') ?? false).toBe(false);
	});
});
