import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// A DID create that fails on the ledger is recorded as an unsuccessful operation with a plain-words category, and
// the error body carries a stable code (U-30).
const createKey = jest.fn(async () => ({ publicKeyHex: 'aa'.repeat(32), kid: 'aa'.repeat(32) }));
const createDid = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = {};
		engine = async (kind: string) => (kind === 'key' ? { createKey } : { createDid });
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));
const create = jest.fn(async (..._args: unknown[]) => ({}));
jest.unstable_mockModule('../../../../src/services/api/operation.js', () => ({
	OperationService: { instance: { create } },
}));

const { DIDController } = await import('../../../../src/controllers/api/did.js');

const customer = { customerId: 'c-1' };

function respond() {
	const response = { statusCode: 0, body: undefined as unknown } as Response & { statusCode: number; body: unknown };
	response.locals = { customer, user: {} };
	response.status = ((code: number) => {
		response.statusCode = code;
		return response;
	}) as never;
	response.json = ((body: unknown) => {
		response.body = body;
		return response;
	}) as never;
	return response;
}

const request = {
	body: { network: 'testnet', options: { verificationMethodType: 'Ed25519VerificationKey2020' } },
} as unknown as Request;

beforeEach(() => {
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	createDid.mockReset();
	create.mockClear();
});

describe('POST /did/create when the ledger write fails', () => {
	it('insufficient funds: 402 with code insufficient_funds, and the attempt is recorded', async () => {
		createDid.mockRejectedValueOnce(
			new Error('spendable balance 0ncheq is smaller than 50ncheq: insufficient funds')
		);
		const response = respond();
		await new DIDController().createDid(request, response);
		expect(response.statusCode).toBe(402);
		expect(response.body).toEqual({
			error: expect.stringContaining('Payment required'),
			code: 'insufficient_funds',
		});
		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith(
			'did',
			'did-create',
			undefined,
			false,
			false,
			customer,
			expect.objectContaining({ outcome: 'error', errorCategory: 'insufficient_funds', network: 'testnet' })
		);
	});

	it('out of gas: 500 keeps its message and adds code out_of_gas', async () => {
		createDid.mockRejectedValueOnce(new Error('out of gas in location: WriteFlat'));
		const response = respond();
		await new DIDController().createDid(request, response);
		expect(response.statusCode).toBe(500);
		expect(response.body).toEqual({
			error: 'Internal error: out of gas in location: WriteFlat',
			code: 'out_of_gas',
		});
		expect(create.mock.calls[0][6]).toEqual(expect.objectContaining({ errorCategory: 'out_of_gas' }));
	});

	it('an unrecognised failure is recorded as other and the body is unchanged (no code)', async () => {
		createDid.mockRejectedValueOnce(new Error('boom'));
		const response = respond();
		await new DIDController().createDid(request, response);
		expect(response.body).toEqual({ error: 'Internal error: boom' });
		expect(create.mock.calls[0][6]).toEqual(expect.objectContaining({ errorCategory: 'other' }));
	});

	it('still answers when recording the attempt fails', async () => {
		create.mockRejectedValueOnce(new Error('database down'));
		createDid.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:26657'));
		const response = respond();
		await new DIDController().createDid(request, response);
		expect(response.statusCode).toBe(500);
		expect(response.body).toEqual(expect.objectContaining({ code: 'ledger_unavailable' }));
	});
});
