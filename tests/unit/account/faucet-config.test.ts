import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { parseNonNegativeIntEnv, parseNumberEnv } from '../../../src/types/constants.js';

describe('parseNumberEnv', () => {
	let warn: ReturnType<typeof jest.spyOn>;
	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('uses the fallback silently when the variable is unset or blank', () => {
		expect(parseNumberEnv(undefined, 100, 'FAUCET_X')).toBe(100);
		expect(parseNumberEnv('', 100, 'FAUCET_X')).toBe(100);
		expect(parseNumberEnv('   ', 100, 'FAUCET_X')).toBe(100);
		expect(warn).not.toHaveBeenCalled();
	});

	it('uses a valid positive number, including decimals', () => {
		expect(parseNumberEnv('250000', 100, 'FAUCET_X')).toBe(250000);
		expect(parseNumberEnv(' 1.5 ', 100, 'FAUCET_X')).toBe(1.5);
		expect(warn).not.toHaveBeenCalled();
	});

	it.each(['abc', '0', '-5', '1,000', 'NaN', 'Infinity'])('falls back loudly for the invalid value %p', (value) => {
		expect(parseNumberEnv(value, 100, 'FAUCET_MONTHLY_LIMIT_CHEQ')).toBe(100);
		expect(warn).toHaveBeenCalledTimes(1);
		const message = String(warn.mock.calls[0][0]);
		expect(message).toContain('FAUCET_MONTHLY_LIMIT_CHEQ');
		expect(message).toContain(value);
		expect(message).toContain('100');
	});
});

describe('parseNonNegativeIntEnv', () => {
	let warn: ReturnType<typeof jest.spyOn>;
	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('uses the fallback silently when unset, and accepts 0 and positive whole numbers', () => {
		expect(parseNonNegativeIntEnv(undefined, 10, 'FAUCET_X')).toBe(10);
		expect(parseNonNegativeIntEnv('0', 10, 'FAUCET_X')).toBe(0);
		expect(parseNonNegativeIntEnv('45', 10, 'FAUCET_X')).toBe(45);
		expect(warn).not.toHaveBeenCalled();
	});

	it.each(['ten', '-1', '1.5', '1e3x', 'NaN'])('falls back loudly for the invalid value %p', (value) => {
		expect(parseNonNegativeIntEnv(value, 10, 'FAUCET_MIN_INTERVAL_SECONDS')).toBe(10);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain('FAUCET_MIN_INTERVAL_SECONDS');
	});
});
