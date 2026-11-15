import { API_KEY_EXPIRATION, API_KEY_MAX_EXPIRATION_DAYS } from '../../types/constants.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * True when the key is no longer valid at `now`. Instants are compared as epoch milliseconds, so the stored timezone
 * does not matter. A key is expired at the exact instant of its expiry, and a missing or unreadable expiry counts as
 * expired (the column is not nullable, so this only guards against a malformed row).
 */
export function isAPIKeyExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
	if (expiresAt === null || expiresAt === undefined) return true;
	const expiry = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
	if (Number.isNaN(expiry)) return true;
	return expiry <= now.getTime();
}

/** The expiry given to a key created without one: API_KEY_EXPIRATION days from `now`. */
export function defaultAPIKeyExpiry(now: Date = new Date()): Date {
	return new Date(now.getTime() + API_KEY_EXPIRATION * MS_PER_DAY);
}

/** Returns why a requested expiry is unacceptable, or null when it is fine. */
export function apiKeyExpiryProblem(
	expiresAt: Date,
	now: Date = new Date(),
	maxDays: number = API_KEY_MAX_EXPIRATION_DAYS
): string | null {
	if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) return 'Invalid date format';
	if (expiresAt.getTime() <= now.getTime()) return 'expiresAt must be in the future';
	if (expiresAt.getTime() > now.getTime() + maxDays * MS_PER_DAY) {
		return `expiresAt must be no more than ${maxDays} days in the future`;
	}
	return null;
}
