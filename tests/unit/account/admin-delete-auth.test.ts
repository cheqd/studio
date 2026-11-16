import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { AdminAuthRuleProvider } from '../../../src/middleware/auth/routes/admin/admin-auth.js';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';

describe('DELETE /admin/organisation/delete auth rule', () => {
	const repository = new AuthRuleRepository();
	repository.push(new AdminAuthRuleProvider());
	const requestFor = (method: string, path: string) => ({ method, path }) as unknown as Request;

	it('requires the admin:organisation:delete scope', () => {
		const rule = repository.match(requestFor('DELETE', '/admin/organisation/delete'));
		expect(rule).not.toBeNull();
		expect(rule?.isValidScope('admin:organisation:delete')).toBe(true);
	});

	it('rejects credentials that lack the scope, including other organisation scopes', () => {
		const rule = repository.match(requestFor('DELETE', '/admin/organisation/delete'));
		expect(rule?.areValidScopes([])).toBe(false);
		expect(rule?.areValidScopes(['admin:organisation:get', 'admin:organisation:update'])).toBe(false);
	});

	it('is not open to unauthenticated callers', () => {
		const rule = repository.match(requestFor('DELETE', '/admin/organisation/delete'));
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});
});
