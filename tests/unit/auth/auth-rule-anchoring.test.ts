import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { createAuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rules.js';
import { AuthRule } from '../../../src/types/authentication.js';

const repository = createAuthRuleRepository();
const rules = repository.getRules();
const requestFor = (method: string, path: string, body: Record<string, unknown> = {}) =>
	({ method, path, body }) as unknown as Request;

describe('auth rules are anchored', () => {
	it('has rules to check', () => {
		expect(rules.length).toBeGreaterThan(100);
	});

	it('anchors every rule at both ends', () => {
		const unanchored = rules
			.map((rule) => `${rule.getMethod()} ${rule.getRoute()}`)
			.filter((id) => !/^[A-Z]+ \^\/.*\$$/.test(id));
		expect(unanchored).toEqual([]);
	});

	it('compiles every rule', () => {
		for (const rule of rules) expect(() => new RegExp(rule.getRoute())).not.toThrow();
	});
});

describe('anchored matching', () => {
	it('matches only the whole path', () => {
		const rule = new AuthRule('^/account$', 'GET', 'read:account', { skipNamespace: true });
		expect(rule.matchesRoute('GET', '/account')).toBe(true);
		expect(rule.matchesRoute('GET', '/account/')).toBe(false);
		expect(rule.matchesRoute('GET', '/account/anything')).toBe(false);
		expect(rule.matchesRoute('GET', '/x/account')).toBe(false);
		expect(rule.matchesRoute('POST', '/account')).toBe(false);
	});

	it('does not let a short rule capture a longer path', () => {
		// POST /account/export-keys needs its own scope; it must never fall to the account-creation rule
		const exportKeys = repository.match(requestFor('POST', '/account/export-keys'));
		expect(exportKeys?.isValidScope('export:account:keys')).toBe(true);
		const create = repository.match(requestFor('POST', '/account/create'));
		expect(create?.isValidScope('create:account')).toBe(true);
		// A path no route defines gets no rule, rather than the rule of a route it merely contains
		expect(repository.match(requestFor('GET', '/account/unknown'))).toBeNull();
		expect(repository.match(requestFor('GET', '/admin/api-key/list/extra'))).toBeNull();
		expect(repository.match(requestFor('GET', '/prefix/did/search/did:cheqd:testnet:abc'))).toBeNull();
	});

	it('matches a path parameter as one segment', () => {
		const did = 'did:cheqd:testnet:5f1e7c1a-0000-4000-8000-000000000000';
		expect(
			repository.match(requestFor('POST', `/did/deactivate/${did}`))?.isValidScope('deactivate:did:testnet')
		).toBe(true);
		expect(repository.match(requestFor('POST', `/did/deactivate/${did}/extra`))).toBeNull();
		expect(
			repository.match(requestFor('GET', '/credentials/issued/abc'))?.isValidScope('list:credential:testnet')
		).toBe(true);
		expect(repository.match(requestFor('GET', '/credentials/issued/abc/def'))).toBeNull();
	});
});
