import { describe, expect, it } from '@jest/globals';
import { validationResult } from 'express-validator';
import { CredentialStatusController } from '../../../../src/controllers/api/credential-status.js';
import { STATUS_LIST_MAX_LENGTH } from '../../../../src/types/constants.js';

/** Runs the create validators and returns the messages reported for `length` only. */
async function lengthErrors(length: unknown): Promise<string[]> {
	const req: any = {
		body: { did: 'did:cheqd:testnet:abc', statusListName: 'list', length },
		query: { listType: 'BitstringStatusList' },
		params: {},
		headers: {},
	};
	for (const chain of CredentialStatusController.createUnencryptedValidator) await (chain as any).run(req);
	return validationResult(req)
		.array()
		.filter((e: any) => e.path === 'length')
		.map((e: any) => String(e.msg));
}

describe('status list length limit', () => {
	it('has a documented default of eight times the 131072 minimum', () => {
		expect(STATUS_LIST_MAX_LENGTH).toBe(1048576);
	});

	it.each([[131072], [140000], [STATUS_LIST_MAX_LENGTH]])('accepts length %d', async (length) => {
		expect(await lengthErrors(length)).toEqual([]);
	});

	it('is optional', async () => {
		expect(await lengthErrors(undefined)).toEqual([]);
	});

	it.each([[STATUS_LIST_MAX_LENGTH + 1], [4_000_000_000], [Number.MAX_SAFE_INTEGER]])(
		'rejects length %d as too large',
		async (length) => {
			expect(await lengthErrors(length)).toEqual([`length: should be at most ${STATUS_LIST_MAX_LENGTH}`]);
		}
	);

	it.each([[16384], [131071]])('rejects length %d below the minimum with a message naming both limits', async (length) => {
		expect(await lengthErrors(length)).toEqual([
			`length: should be at least 131072 (the minimum entries for herd privacy) and at most ${STATUS_LIST_MAX_LENGTH}`,
		]);
	});

	it.each([[0], [-8], [1.5], ['abc']])('rejects length %p', async (length) => {
		expect((await lengthErrors(length)).length).toBeGreaterThan(0);
	});
});
