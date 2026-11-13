import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';
import { AgentAuthRuleProvider } from '../../../src/middleware/auth/routes/api/agent-auth.js';
import { AccountAuthProvider } from '../../../src/middleware/auth/routes/api/account-auth.js';
import { CredentialAuthRuleProvider } from '../../../src/middleware/auth/routes/api/credential-auth.js';
import { DidAuthRuleProvider } from '../../../src/middleware/auth/routes/api/did-auth.js';
import { KeyAuthProvider } from '../../../src/middleware/auth/routes/api/key-auth.js';

const requestFor = (method: string, path: string, body?: unknown) => ({ method, path, body }) as unknown as Request;
const id = 'a1b2c3d4-0000-4000-8000-000000000001';

// The order the real repository uses (src/middleware/authentication.ts): the agent provider comes after these.
const repository = new AuthRuleRepository();
for (const provider of [
	new AccountAuthProvider(),
	new KeyAuthProvider(),
	new DidAuthRuleProvider(),
	new CredentialAuthRuleProvider(),
	new AgentAuthRuleProvider(),
]) {
	repository.push(provider);
}

describe('agent auth rules', () => {
	it.each([
		['POST', '/agents', 'create:agent'],
		['GET', '/agents', 'list:agent'],
		['GET', `/agents/${id}`, 'read:agent'],
		['PATCH', `/agents/${id}`, 'update:agent'],
		['DELETE', `/agents/${id}`, 'delete:agent'],
		['POST', `/agents/${id}/card`, 'create:agent-card'],
		['GET', `/agents/${id}/card`, 'read:agent-card'],
		['GET', `/agents/${id}/authority`, 'read:agent'],
		['POST', `/agents/${id}/authority`, 'issue:agent-authority'],
		['DELETE', `/agents/${id}/authority/${id}`, 'revoke:agent-authority'],
		['GET', `/agents/${id}/payment-addresses`, 'read:agent'],
		['POST', `/agents/${id}/payment-addresses`, 'issue:agent-payment-address'],
		['DELETE', `/agents/${id}/payment-addresses/${id}`, 'revoke:agent-payment-address'],
		['GET', `/agents/${id}/settlement`, 'read:agent'],
	])('%s %s needs exactly %s and is not open to anonymous callers', (method, path, scope) => {
		const rule = repository.match(requestFor(method, path, {}));
		expect(rule).not.toBeNull();
		expect(rule?.isValidScope(scope)).toBe(true);
		expect(rule?.areValidScopes(['read:key', 'create:did:testnet', 'verify:credential:testnet'])).toBe(false);
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});

	it('one scope does not open another route (read:agent cannot create or revoke)', () => {
		for (const [method, path] of [
			['POST', '/agents'],
			['DELETE', `/agents/${id}`],
			['POST', `/agents/${id}/authority`],
			['DELETE', `/agents/${id}/authority/${id}`],
			['POST', `/agents/${id}/payment-addresses`],
			['DELETE', `/agents/${id}/payment-addresses/${id}`],
		] as const) {
			expect(
				repository
					.match(requestFor(method, path, {}))
					?.areValidScopes(['read:agent', 'list:agent', 'read:agent-card'])
			).toBe(false);
		}
	});

	it('anchored: look-alike paths and other methods match nothing in the agent provider', () => {
		const provider = new AgentAuthRuleProvider();
		for (const [method, path] of [
			['PUT', '/agents'],
			['PUT', `/agents/${id}`],
			['GET', '/agents/'],
			['GET', '/admin/agents'],
			['GET', '/did/agents'],
			['POST', '/agentsx'],
			['GET', `/agents/${id}/authority/${id}`],
			['PUT', `/agents/${id}/authority`],
			['GET', `/agents/${id}/authority/`],
			['POST', `/agents/${id}/authority/${id}`],
			['DELETE', `/agents/${id}/card`],
			['GET', `/agents/${id}/card/extra`],
			['POST', '/verify/agent'],
			['POST', '/v1/agents'],
			['GET', `/agents/${id}/payment-addresses/${id}`],
			['PUT', `/agents/${id}/payment-addresses`],
			['POST', `/agents/${id}/payment-addresses/${id}`],
			['GET', `/agents/${id}/payment-addresses/`],
			['POST', `/agents/${id}/settlement`],
			['DELETE', `/agents/${id}/settlement`],
			['GET', `/admin/agents/${id}/settlement`],
			['GET', `/agents/${id}/settlement/extra`],
		] as const) {
			expect(provider.match(requestFor(method, path, {}))).toBeNull();
		}
	});
});
