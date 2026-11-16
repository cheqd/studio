import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// A customer whose `credoTenantId` points at a tenant that is not in Askar: the engine raises
// CredoTenantMissingError, and /did/create must answer exactly as the agent routes do.
const { CredoTenantMissingError } = await import('../../../../src/services/identity/engine/credo/errors.js');

const createKey = jest.fn(async () => {
	throw new CredoTenantMissingError('tenant-gone');
});
const createDid = jest.fn(async () => ({ did: 'did:cheqd:testnet:should-not-exist' }));

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = {};
		engine = async (kind: string) => (kind === 'key' ? { createKey } : { createDid });
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));

const { DIDController } = await import('../../../../src/controllers/api/did.js');

function respond() {
	const response = { statusCode: 0, body: undefined as unknown } as Response & { statusCode: number; body: unknown };
	response.locals = { customer: { customerId: 'c-1' }, user: {} };
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

beforeEach(() => {
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	createKey.mockClear();
	createDid.mockClear();
});

describe('POST /did/create for a customer whose Credo tenant is missing', () => {
	it('answers 500 credo_tenant_missing with no tenant id, logs it, and creates nothing', async () => {
		const response = respond();
		const request = {
			body: { network: 'testnet', options: { verificationMethodType: 'Ed25519VerificationKey2020' } },
		} as unknown as Request;
		await new DIDController().createDid(request, response);
		expect(response.statusCode).toBe(500);
		expect(response.body).toEqual({
			error: 'The identity engine record for this account is missing. Contact support; nothing was changed.',
			code: 'credo_tenant_missing',
		});
		expect(JSON.stringify(response.body)).not.toContain('tenant-gone');
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('tenant-gone'));
		expect(createDid).not.toHaveBeenCalled();
	});

	it('keeps the generic 500 for other failures', async () => {
		createKey.mockImplementationOnce(async () => {
			throw new Error('boom');
		});
		const response = respond();
		const request = {
			body: { network: 'testnet', options: { verificationMethodType: 'Ed25519VerificationKey2020' } },
		} as unknown as Request;
		await new DIDController().createDid(request, response);
		expect(response.statusCode).toBe(500);
		expect(response.body).toEqual({ error: 'Internal error: boom' });
	});
});
