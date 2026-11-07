import { describe, expect, it } from '@jest/globals';
import { defaultApiKeyExpiry } from '../../../src/services/admin/api-key-expiry.js';

describe('defaultApiKeyExpiry', () => {
	it('adds the given number of days, not months', () => {
		expect(defaultApiKeyExpiry(new Date('2026-01-01T00:00:00.000Z'), 30)).toEqual(
			new Date('2026-01-31T00:00:00.000Z')
		);
	});

	it('is independent of the day of the week', () => {
		// 2026-01-05 is a Monday (getDay() === 1); the old setMonth(getDay() + 30) bug depended on this.
		expect(defaultApiKeyExpiry(new Date('2026-01-05T00:00:00.000Z'), 30)).toEqual(
			new Date('2026-02-04T00:00:00.000Z')
		);
	});

	it('does not mutate the input date', () => {
		const from = new Date('2026-01-01T00:00:00.000Z');
		defaultApiKeyExpiry(from, 30);
		expect(from).toEqual(new Date('2026-01-01T00:00:00.000Z'));
	});
});
