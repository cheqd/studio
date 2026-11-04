import { describe, expect, it } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import { unfundedPayerFailure } from '../../../src/helpers/ledger-errors.js';

describe('unfundedPayerFailure', () => {
	it('returns 402 with the address when the payer account does not exist on chain', () => {
		const error = new Error(
			"Error: Account 'cheqd1957wmkx3cgvjpz0yhwlh6ln7c0f4v4ga7u0f2c' does not exist on chain. Send some tokens there before trying to query sequence."
		);
		const failure = unfundedPayerFailure(error);
		expect(failure?.status).toBe(StatusCodes.PAYMENT_REQUIRED);
		expect(failure?.error).toContain('cheqd1957wmkx3cgvjpz0yhwlh6ln7c0f4v4ga7u0f2c');
		expect(failure?.error).toContain('POST /account/faucet');
	});

	it('returns 402 when the chain rejects the fee for insufficient funds', () => {
		const error = new Error('spendable balance 10ncheq is smaller than 50000000000ncheq: insufficient funds');
		expect(unfundedPayerFailure(error)?.status).toBe(StatusCodes.PAYMENT_REQUIRED);
	});

	it('leaves other errors to the caller', () => {
		expect(unfundedPayerFailure(new Error('DID document is invalid'))).toBeUndefined();
		expect(unfundedPayerFailure('something else')).toBeUndefined();
	});
});
