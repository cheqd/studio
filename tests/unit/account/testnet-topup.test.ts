import { describe, expect, it } from '@jest/globals';
import { isNewTestnetAccount } from '../../../src/helpers/testnet-topup.js';

describe('isNewTestnetAccount', () => {
	it('tops up a customer created by this call, even though the testnet account already exists', () => {
		// CustomerService.create creates the default testnet payment account, so it always exists when accounts are read
		expect(isNewTestnetAccount(true, true)).toBe(true);
	});

	it('tops up a customer whose testnet account was created by this call', () => {
		expect(isNewTestnetAccount(false, false)).toBe(true);
	});

	it('does not top up again on a later call for an existing customer with an existing testnet account', () => {
		expect(isNewTestnetAccount(false, true)).toBe(false);
	});
});
