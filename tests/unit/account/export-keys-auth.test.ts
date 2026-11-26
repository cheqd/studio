import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { AccountAuthProvider } from '../../../src/middleware/auth/routes/api/account-auth.js';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';

describe('POST /account/export-keys auth rule', () => {
	const repository = new AuthRuleRepository();
	repository.push(new AccountAuthProvider());
	const requestFor = (method: string, path: string) => ({ method, path }) as unknown as Request;

	it('requires its own export:account:keys scope, not read:account', () => {
		const rule = repository.match(requestFor('POST', '/account/export-keys'));
		expect(rule).not.toBeNull();
		expect(rule?.isValidScope('export:account:keys')).toBe(true);
		expect(rule?.areValidScopes(['read:account'])).toBe(false);
	});

	it('is not open to unauthenticated callers', () => {
		const rule = repository.match(requestFor('POST', '/account/export-keys'));
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});
});
