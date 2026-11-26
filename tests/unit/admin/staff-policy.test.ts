import { afterEach, describe, expect, it } from '@jest/globals';
import {
	evaluateStaffAccess,
	staffEmailDomains,
	staffRoleNames,
	type StaffAccessInput,
} from '../../../src/controllers/admin/staff-policy.js';

const good: StaffAccessInput = {
	scopes: ['admin:customers:read'],
	requiredScope: 'admin:customers:read',
	email: 'someone@cheqd.io',
	emailVerified: true,
	roles: ['cheqd admin'],
	authMethod: 'portal-user-session',
};

afterEach(() => {
	delete process.env.STAFF_EMAIL_DOMAINS;
	delete process.env.STAFF_ROLE_NAMES;
});

describe('evaluateStaffAccess', () => {
	it('allows when every check passes', () => {
		expect(evaluateStaffAccess(good)).toEqual({ allowed: true });
	});

	it.each([
		['missing scope', { scopes: ['admin:audit:read'] }, 'missing-scope'],
		['no scopes', { scopes: undefined }, 'missing-scope'],
		['unverified email', { emailVerified: false }, 'email-unverified'],
		['other domain', { email: 'someone@example.com' }, 'email-domain'],
		['subdomain of an allowed domain', { email: 'someone@mail.cheqd.io' }, 'email-domain'],
		['look-alike domain', { email: 'someone@cheqd.io.example.com' }, 'email-domain'],
		['local part carries the domain', { email: 'someone@cheqd.io@example.com' }, 'email-domain'],
		['no role', { roles: [] }, 'role-missing'],
		['other role', { roles: ['Portal'] }, 'role-missing'],
		['role in other case', { roles: ['Cheqd Admin'] }, 'role-missing'],
		['m2m session', { authMethod: 'm2m' }, 'not-user-session'],
		['api key session', { authMethod: 'api-key' }, 'not-user-session'],
		['id token only', { authMethod: 'id-token' }, 'not-user-session'],
		['no auth method', { authMethod: undefined }, 'not-user-session'],
		['no email', { email: undefined }, 'identity-missing'],
		['empty email', { email: '' }, 'identity-missing'],
		['no verification flag', { emailVerified: undefined }, 'identity-missing'],
		['no roles data', { roles: undefined }, 'identity-missing'],
	])('denies: %s', (_name, patch, reason) => {
		expect(evaluateStaffAccess({ ...good, ...patch } as StaffAccessInput)).toEqual({ allowed: false, reason });
	});

	it('does not treat a truthy string as a verified email (fails closed)', () => {
		expect(evaluateStaffAccess({ ...good, emailVerified: 'true' as unknown as boolean })).toEqual({
			allowed: false,
			reason: 'identity-missing',
		});
	});

	it('denies a malformed address', () => {
		for (const email of ['cheqd.io', '@cheqd.io', 'someone@', 'some one@cheqd.io']) {
			expect(evaluateStaffAccess({ ...good, email })).toEqual({ allowed: false, reason: 'email-domain' });
		}
	});

	it('compares the domain case-insensitively', () => {
		expect(evaluateStaffAccess({ ...good, email: 'Someone@CHEQD.IO' })).toEqual({ allowed: true });
	});

	it('reads the allowed domains from STAFF_EMAIL_DOMAINS', () => {
		process.env.STAFF_EMAIL_DOMAINS = ' Example.org , other.example ';
		expect(evaluateStaffAccess({ ...good, email: 'a@example.org' })).toEqual({ allowed: true });
		expect(evaluateStaffAccess({ ...good, email: 'a@cheqd.io' })).toEqual({
			allowed: false,
			reason: 'email-domain',
		});
	});

	it('allows subdomains only for an explicit wildcard, never the apex', () => {
		process.env.STAFF_EMAIL_DOMAINS = '*.example.org';
		expect(evaluateStaffAccess({ ...good, email: 'a@team.example.org' })).toEqual({ allowed: true });
		expect(evaluateStaffAccess({ ...good, email: 'a@example.org' })).toEqual({
			allowed: false,
			reason: 'email-domain',
		});
		expect(evaluateStaffAccess({ ...good, email: 'a@evilexample.org' })).toEqual({
			allowed: false,
			reason: 'email-domain',
		});
	});

	it('reads the role names from STAFF_ROLE_NAMES', () => {
		process.env.STAFF_ROLE_NAMES = 'support, ops lead';
		expect(evaluateStaffAccess({ ...good, roles: ['ops lead'] })).toEqual({ allowed: true });
		expect(evaluateStaffAccess({ ...good, roles: ['cheqd admin'] })).toEqual({
			allowed: false,
			reason: 'role-missing',
		});
	});

	it('falls back to the defaults when the variables are blank, and fails closed on an empty list', () => {
		process.env.STAFF_EMAIL_DOMAINS = ' , ';
		process.env.STAFF_ROLE_NAMES = '';
		expect(staffEmailDomains()).toEqual(['cheqd.io']);
		expect(staffRoleNames()).toEqual(['cheqd admin']);
	});
});
