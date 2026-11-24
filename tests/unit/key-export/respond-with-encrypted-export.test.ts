import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { CredoTenantMissingError } from '../../../src/services/identity/engine/credo/errors.js';
import { decryptKeyExport, respondWithEncryptedExport } from '../../../src/helpers/key-export.js';

const SECRET_HEX = 'deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef';
const PASSWORD = 'correct horse battery staple';

function mockResponse() {
	const res = { statusCode: 0, body: undefined as unknown } as { statusCode: number; body: unknown } & Record<
		string,
		unknown
	>;
	res.status = jest.fn((code: number) => {
		res.statusCode = code;
		return res;
	});
	res.json = jest.fn((body: unknown) => {
		res.body = body;
		return res;
	});
	return res;
}

const producer = async () => ({ privateKeyHex: SECRET_HEX });

describe('respondWithEncryptedExport', () => {
	it('never returns the plaintext key material', async () => {
		const res = mockResponse();
		await respondWithEncryptedExport(
			{ body: { password: PASSWORD } } as Request,
			res as unknown as Response,
			producer
		);
		expect(res.statusCode).toBe(200);
		expect(JSON.stringify(res.body)).not.toContain(SECRET_HEX);
	});

	it('round-trips with the supplied password and fails with a wrong one', async () => {
		const res = mockResponse();
		await respondWithEncryptedExport(
			{ body: { password: PASSWORD } } as Request,
			res as unknown as Response,
			producer
		);
		const envelope = res.body as Parameters<typeof decryptKeyExport>[0];
		expect(await decryptKeyExport(envelope, PASSWORD)).toEqual({ privateKeyHex: SECRET_HEX });
		await expect(decryptKeyExport(envelope, 'some other long password')).rejects.toThrow();
	});

	it('returns 400 PASSWORD_REQUIRED and does not call the producer when the password is missing', async () => {
		const res = mockResponse();
		const spy = jest.fn(producer);
		await respondWithEncryptedExport({ body: {} } as Request, res as unknown as Response, spy);
		expect(res.statusCode).toBe(400);
		expect((res.body as { code: string }).code).toBe('PASSWORD_REQUIRED');
		expect(spy).not.toHaveBeenCalled();
	});

	it('returns 400 WEAK_PASSWORD for a weak password', async () => {
		const res = mockResponse();
		const spy = jest.fn(producer);
		await respondWithEncryptedExport({ body: { password: 'abc' } } as Request, res as unknown as Response, spy);
		expect(res.statusCode).toBe(400);
		expect((res.body as { code: string }).code).toBe('WEAK_PASSWORD');
		expect(spy).not.toHaveBeenCalled();
	});

	it('returns 500 without leaking key material when the producer fails', async () => {
		const res = mockResponse();
		await respondWithEncryptedExport(
			{ body: { password: PASSWORD } } as Request,
			res as unknown as Response,
			async () => {
				const material = { privateKeyHex: SECRET_HEX };
				void material;
				throw new Error('boom');
			}
		);
		expect(res.statusCode).toBe(500);
		const serialised = JSON.stringify(res.body);
		expect(serialised).not.toContain(SECRET_HEX);
		expect(serialised).not.toContain(PASSWORD);
	});

	it('keeps the Credo tenant-missing answer (500 with code credo_tenant_missing) instead of a generic 500', async () => {
		const res = mockResponse();
		const error = new CredoTenantMissingError('tenant-1');
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		await respondWithEncryptedExport(
			{ body: { password: PASSWORD } } as Request,
			res as unknown as Response,
			async () => {
				throw error;
			}
		);
		errorSpy.mockRestore();
		expect(res.statusCode).toBe(500);
		expect(res.body).toEqual({ error: error.message, code: 'credo_tenant_missing' });
	});

	it('maps other typed engine errors through the wrapper (ownership error gives 404)', async () => {
		const res = mockResponse();
		const { CredoOwnershipError } = await import('../../../src/services/identity/engine/credo/errors.js');
		await respondWithEncryptedExport(
			{ body: { password: PASSWORD } } as Request,
			res as unknown as Response,
			async () => {
				throw new CredoOwnershipError('did:cheqd:testnet:abc');
			}
		);
		expect(res.statusCode).toBe(404);
	});
});
