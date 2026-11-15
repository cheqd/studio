/**
 * Staff access policy. Pure: no I/O and no request objects, so every branch can be tested.
 *
 * A caller may use a staff route only when ALL of these hold:
 *  1. the call is a named person's portal user session (never a machine client, API key or bare ID token);
 *  2. the identity data (email, email verification, roles) is present, so a missing field fails closed;
 *  3. the caller holds the staff scope the route needs;
 *  4. the email is verified;
 *  5. the email domain is one of STAFF_EMAIL_DOMAINS (default `cheqd.io`);
 *  6. the caller holds one of the roles in STAFF_ROLE_NAMES (default `cheqd admin`) in Logto.
 */

export type StaffAccessDenial =
	| 'missing-scope'
	| 'email-unverified'
	| 'email-domain'
	| 'role-missing'
	| 'not-user-session'
	| 'identity-missing';

export type StaffAccessResult = { allowed: true } | { allowed: false; reason: StaffAccessDenial };

/** The only authentication method that may use a staff route. */
export const USER_SESSION_AUTH_METHOD = 'portal-user-session';

export interface StaffAccessInput {
	scopes?: string[];
	requiredScope: string;
	email?: string;
	emailVerified?: boolean;
	roles?: string[];
	authMethod?: string;
}

const DEFAULT_DOMAINS = ['cheqd.io'];
const DEFAULT_ROLES = ['cheqd admin'];

function parseList(value: string | undefined, fallback: string[], lowerCase: boolean): string[] {
	const items = (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0)
		.map((item) => (lowerCase ? item.toLowerCase() : item));
	return items.length > 0 ? items : fallback;
}

/** Allowed email domains (lower case). Read on every call so a change of environment needs no code path to refresh. */
export function staffEmailDomains(env: NodeJS.ProcessEnv = process.env): string[] {
	return parseList(env.STAFF_EMAIL_DOMAINS, DEFAULT_DOMAINS, true);
}

/** Allowed staff role names, compared exactly (after trimming), as Logto role names are case sensitive. */
export function staffRoleNames(env: NodeJS.ProcessEnv = process.env): string[] {
	return parseList(env.STAFF_ROLE_NAMES, DEFAULT_ROLES, false);
}

function domainOf(email: string): string | undefined {
	const trimmed = email.trim();
	if (/\s/.test(trimmed)) return undefined;
	const at = trimmed.lastIndexOf('@');
	if (at < 1 || at === trimmed.length - 1) return undefined;
	return trimmed.slice(at + 1).toLowerCase();
}

function domainAllowed(domain: string, allowed: string[]): boolean {
	return allowed.some((entry) => {
		if (entry.startsWith('*.')) {
			const suffix = entry.slice(1); // ".example.org"
			return domain.length > suffix.length && domain.endsWith(suffix);
		}
		return domain === entry;
	});
}

export function evaluateStaffAccess(input: StaffAccessInput, env: NodeJS.ProcessEnv = process.env): StaffAccessResult {
	const deny = (reason: StaffAccessDenial): StaffAccessResult => ({ allowed: false, reason });

	if (input.authMethod !== USER_SESSION_AUTH_METHOD) return deny('not-user-session');
	if (
		typeof input.email !== 'string' ||
		input.email.trim() === '' ||
		typeof input.emailVerified !== 'boolean' ||
		!Array.isArray(input.roles)
	) {
		return deny('identity-missing');
	}
	if (!Array.isArray(input.scopes) || !input.scopes.includes(input.requiredScope)) return deny('missing-scope');
	if (input.emailVerified !== true) return deny('email-unverified');
	const domain = domainOf(input.email);
	if (!domain || !domainAllowed(domain, staffEmailDomains(env))) return deny('email-domain');
	const wanted = staffRoleNames(env);
	if (!input.roles.some((role) => typeof role === 'string' && wanted.includes(role.trim()))) {
		return deny('role-missing');
	}
	return { allowed: true };
}
