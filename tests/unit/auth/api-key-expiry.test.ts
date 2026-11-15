import { describe, expect, it } from '@jest/globals';
import {
	apiKeyExpiryProblem,
	defaultAPIKeyExpiry,
	isAPIKeyExpired,
} from '../../../src/services/admin/api-key-expiry.js';
import { API_KEY_EXPIRATION } from '../../../src/types/constants.js';

const now = new Date('2030-06-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('isAPIKeyExpired', () => {
	it('accepts a key whose expiry is in the future', () => {
		expect(isAPIKeyExpired(new Date(now.getTime() + 1), now)).toBe(false);
	});

	it('rejects a key whose expiry has passed', () => {
		expect(isAPIKeyExpired(new Date(now.getTime() - 1), now)).toBe(true);
	});

	it('rejects a key at the exact instant of expiry', () => {
		expect(isAPIKeyExpired(new Date(now.getTime()), now)).toBe(true);
	});

	it('compares instants, so the offset used to write the date does not matter', () => {
		expect(isAPIKeyExpired(new Date('2030-06-15T14:00:00+02:00'), now)).toBe(true); // 12:00 UTC, the same instant
		expect(isAPIKeyExpired(new Date('2030-06-15T14:00:01+02:00'), now)).toBe(false);
	});

	it('treats a missing or unreadable expiry as expired: there is no never-expires key', () => {
		expect(isAPIKeyExpired(null, now)).toBe(true);
		expect(isAPIKeyExpired(undefined, now)).toBe(true);
		expect(isAPIKeyExpired(new Date('not a date'), now)).toBe(true);
		expect(isAPIKeyExpired('garbage', now)).toBe(true);
	});
});

describe('defaultAPIKeyExpiry', () => {
	it('is API_KEY_EXPIRATION days after now', () => {
		expect(defaultAPIKeyExpiry(now).getTime() - now.getTime()).toBe(API_KEY_EXPIRATION * DAY);
	});
});

describe('apiKeyExpiryProblem', () => {
	it('accepts a future expiry within the maximum', () => {
		expect(apiKeyExpiryProblem(new Date(now.getTime() + DAY), now, 730)).toBeNull();
	});

	it('accepts an expiry exactly at the maximum', () => {
		expect(apiKeyExpiryProblem(new Date(now.getTime() + 730 * DAY), now, 730)).toBeNull();
	});

	it('rejects an expiry in the past or exactly now', () => {
		expect(apiKeyExpiryProblem(new Date(now.getTime() - DAY), now, 730)).toBe('expiresAt must be in the future');
		expect(apiKeyExpiryProblem(new Date(now.getTime()), now, 730)).toBe('expiresAt must be in the future');
	});

	it('rejects an expiry beyond the maximum', () => {
		expect(apiKeyExpiryProblem(new Date(now.getTime() + 730 * DAY + 1), now, 730)).toMatch(/no more than 730 days/);
	});

	it('rejects an invalid date', () => {
		expect(apiKeyExpiryProblem(new Date('nope'), now, 730)).toBe('Invalid date format');
	});
});
