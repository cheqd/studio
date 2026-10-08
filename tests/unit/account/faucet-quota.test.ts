import { describe, it, expect } from '@jest/globals';
import {
	fitsInQuota,
	getFaucetQuotaWindow,
	remainingQuota,
	secondsUntilReset,
} from '../../../src/helpers/faucet-quota.js';

describe('getFaucetQuotaWindow', () => {
	it('returns the calendar month in UTC containing the date', () => {
		const window = getFaucetQuotaWindow(new Date('2026-10-08T15:30:00Z'));
		expect(window.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
		expect(window.resetsAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});

	it('rolls over the year in December', () => {
		const window = getFaucetQuotaWindow(new Date('2026-12-31T23:59:59Z'));
		expect(window.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
		expect(window.resetsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	it('treats the first instant of a month as inside that month', () => {
		const window = getFaucetQuotaWindow(new Date('2026-11-01T00:00:00Z'));
		expect(window.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});

	it('uses UTC rather than local time near a boundary', () => {
		const window = getFaucetQuotaWindow(new Date('2026-10-31T23:30:00-05:00'));
		expect(window.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});
});

describe('secondsUntilReset', () => {
	it('counts seconds to the start of next month', () => {
		const now = new Date('2026-10-31T23:00:00Z');
		expect(secondsUntilReset(getFaucetQuotaWindow(now), now)).toBe(3600);
	});

	it('rounds up and never returns less than 1', () => {
		const now = new Date('2026-10-31T23:59:59.500Z');
		expect(secondsUntilReset(getFaucetQuotaWindow(now), now)).toBe(1);
	});
});

describe('quota arithmetic', () => {
	const limit = 100_000n * 1_000_000_000n;

	it('allows a request that exactly reaches the limit', () => {
		expect(fitsInQuota(limit - 10n, 10n, limit)).toBe(true);
	});

	it('rejects a request that goes one ncheq over the limit', () => {
		expect(fitsInQuota(limit - 10n, 11n, limit)).toBe(false);
	});

	it('rejects any request once the quota is used up', () => {
		expect(fitsInQuota(limit, 1n, limit)).toBe(false);
	});

	it('reports remaining quota and clamps at zero', () => {
		expect(remainingQuota(40_000n * 1_000_000_000n, limit)).toBe(60_000n * 1_000_000_000n);
		expect(remainingQuota(limit + 5n, limit)).toBe(0n);
	});
});
