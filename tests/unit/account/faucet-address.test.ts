import { describe, expect, it } from '@jest/globals';
import { toBech32 } from '@cosmjs/encoding';
import { isValidFaucetAddress } from '../../../src/helpers/faucet.js';

describe('isValidFaucetAddress', () => {
	const account = toBech32('cheqd', new Uint8Array(20).fill(7));

	it('accepts a lowercase cheqd account address', () => {
		expect(isValidFaucetAddress(account)).toBe(true);
	});

	it('rejects an uppercase address', () => {
		expect(isValidFaucetAddress(account.toUpperCase())).toBe(false);
	});

	it('rejects a valid bech32 address with another prefix', () => {
		expect(isValidFaucetAddress(toBech32('cosmos', new Uint8Array(20).fill(7)))).toBe(false);
	});

	it('rejects a cheqd address that is not 20 bytes, such as a contract address', () => {
		expect(isValidFaucetAddress(toBech32('cheqd', new Uint8Array(32).fill(7)))).toBe(false);
	});

	it('rejects a bad checksum, a truncated address and non-addresses', () => {
		const badChecksum = `${account.slice(0, -1)}${account.endsWith('q') ? 'p' : 'q'}`;
		expect(isValidFaucetAddress(badChecksum)).toBe(false);
		expect(isValidFaucetAddress(account.slice(0, -4))).toBe(false);
		expect(isValidFaucetAddress('cheqd1someoneelse')).toBe(false);
		expect(isValidFaucetAddress('')).toBe(false);
	});
});
