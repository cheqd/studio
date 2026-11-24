import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
	LEDGER_ERROR_CODES,
	LEDGER_ERROR_LABELS,
	ledgerErrorCategory,
	ledgerErrorCode,
	recordFailedLedgerWrite,
	type FailedLedgerWriteDeps,
} from '../../../src/helpers/ledger-write-failure.js';
import { LedgerUnavailableError } from '../../../src/services/identity/ledger-lock.js';
import { CredoOwnershipError } from '../../../src/services/identity/engine/credo/errors.js';
import type { CustomerEntity } from '../../../src/database/entities/customer.entity.js';

const customer = { customerId: '11111111-1111-4111-8111-111111111111' } as CustomerEntity;

beforeEach(() => {
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('ledgerErrorCategory (U-30)', () => {
	it.each([
		["Account 'cheqd1abc' does not exist on chain. Send some tokens there", 'insufficient_funds'],
		['spendable balance 10ncheq is smaller than 50000000000ncheq: insufficient funds', 'insufficient_funds'],
		['insufficient fee: got 1ncheq required 2ncheq', 'insufficient_funds'],
		['out of gas in location: WriteFlat; gasWanted: 200000, gasUsed: 201000', 'out_of_gas'],
		['connect ECONNREFUSED 10.0.0.1:443', 'ledger_unavailable'],
		['fetch failed', 'ledger_unavailable'],
		['Request failed with status code 503', 'ledger_unavailable'],
		['Transaction with ID ABC was submitted but was not yet found on the chain', 'ledger_unavailable'],
		['Broadcasting transaction failed with code 4 (codespace: sdk)', 'rejected'],
		['account sequence mismatch, expected 5, got 4', 'rejected'],
		['signature verification failed', 'rejected'],
		['DID document is invalid', 'other'],
		['boom', 'other'],
	])('%s -> %s', (message, category) => {
		expect(ledgerErrorCategory(new Error(message))).toBe(category);
	});

	it('a ledger busy for the account is unavailable', () => {
		expect(ledgerErrorCategory(new LedgerUnavailableError('busy'))).toBe('ledger_unavailable');
	});

	it('every category has a plain-words label, and a stable code except other', () => {
		expect(Object.keys(LEDGER_ERROR_LABELS).sort()).toEqual(Object.keys(LEDGER_ERROR_CODES).sort());
		expect(LEDGER_ERROR_CODES).toEqual({
			insufficient_funds: 'insufficient_funds',
			out_of_gas: 'out_of_gas',
			ledger_unavailable: 'ledger_unavailable',
			rejected: 'ledger_rejected',
			other: undefined,
		});
		expect(ledgerErrorCode('rejected')).toEqual({ code: 'ledger_rejected' });
		expect(ledgerErrorCode('other')).toEqual({});
		expect(ledgerErrorCode(undefined)).toEqual({});
	});
});

describe('recordFailedLedgerWrite (U-30)', () => {
	function fakeDeps() {
		const insert = jest.fn<FailedLedgerWriteDeps['insert']>(async () => undefined);
		return { insert, deps: { insert } as FailedLedgerWriteDeps };
	}

	it('writes one unsuccessful operation with its category and the network, and no payload', async () => {
		const { insert, deps } = fakeDeps();
		const secret = 'privateKeyHex=deadbeef';
		const category = await recordFailedLedgerWrite(
			{ category: 'resource', name: 'resource-create', customer, did: 'did:cheqd:testnet:abc' },
			new Error('out of gas'),
			deps
		);
		expect(category).toBe('out_of_gas');
		expect(insert).toHaveBeenCalledTimes(1);
		const [operation, stored] = insert.mock.calls[0];
		expect(stored).toBe('out_of_gas');
		expect(operation).toEqual({
			category: 'resource',
			name: 'resource-create',
			customer,
			successful: false,
			data: { did: 'did:cheqd:testnet:abc' },
		});
		expect(JSON.stringify(insert.mock.calls)).not.toContain(secret);
	});

	it('takes the network from the request when there is no DID yet', async () => {
		const { insert, deps } = fakeDeps();
		await recordFailedLedgerWrite(
			{ category: 'did', name: 'did-create', customer, network: 'mainnet' },
			new Error('insufficient funds'),
			deps
		);
		expect(insert.mock.calls[0][0].data).toEqual({ did: 'did:cheqd:mainnet:' });
	});

	it('records nothing for a caller error (not yours, not supported): nothing reached the ledger', async () => {
		const { insert, deps } = fakeDeps();
		const category = await recordFailedLedgerWrite(
			{ category: 'did', name: 'did-update', customer, did: 'did:cheqd:testnet:abc' },
			new CredoOwnershipError('did:cheqd:testnet:abc'),
			deps
		);
		expect(category).toBeUndefined();
		expect(insert).not.toHaveBeenCalled();
	});

	it('records a busy ledger (503) as ledger_unavailable', async () => {
		const { insert, deps } = fakeDeps();
		await recordFailedLedgerWrite(
			{ category: 'did', name: 'did-deactivate', customer, did: 'did:cheqd:testnet:abc' },
			new LedgerUnavailableError('busy'),
			deps
		);
		expect(insert.mock.calls[0][1]).toBe('ledger_unavailable');
	});

	it('without a customer it still categorises but writes nothing', async () => {
		const { insert, deps } = fakeDeps();
		expect(
			await recordFailedLedgerWrite({ category: 'did', name: 'did-create', customer: undefined }, 'boom', deps)
		).toBe('other');
		expect(insert).not.toHaveBeenCalled();
	});

	it('never throws when the write fails, and still returns the category for the error code', async () => {
		const deps = {
			insert: async () => {
				throw new Error('database down');
			},
		} as FailedLedgerWriteDeps;
		await expect(
			recordFailedLedgerWrite({ category: 'did', name: 'did-create', customer }, new Error('fetch failed'), deps)
		).resolves.toBe('ledger_unavailable');
	});
});
