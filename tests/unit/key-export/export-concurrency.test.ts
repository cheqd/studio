import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { getMaxExportConcurrency, tryAcquireExportSlot } from '../../../src/helpers/export-concurrency.js';
import { respondWithEncryptedExport } from '../../../src/helpers/key-export.js';

const PASSWORD = 'correct horse battery staple';

afterEach(() => {
	delete process.env.KEY_EXPORT_MAX_CONCURRENCY;
});

function mockResponse(customerId?: string) {
	const headers: Record<string, string> = {};
	const res = {
		statusCode: 0,
		body: undefined as unknown,
		headers,
		locals: customerId ? { customer: { customerId } } : {},
	} as Record<string, any>;
	res.status = jest.fn((c: number) => {
		res.statusCode = c;
		return res;
	});
	res.json = jest.fn((b: unknown) => {
		res.body = b;
		return res;
	});
	res.setHeader = jest.fn((k: string, v: string) => {
		headers[k] = v;
	});
	return res;
}

const req = { body: { password: PASSWORD } } as Request;

describe('getMaxExportConcurrency', () => {
	it('defaults to 2 and falls back on invalid values', () => {
		expect(getMaxExportConcurrency()).toBe(2);
		for (const bad of ['0', '-1', 'abc', '1.5', '', ' ']) {
			process.env.KEY_EXPORT_MAX_CONCURRENCY = bad;
			expect(getMaxExportConcurrency()).toBe(2);
		}
	});

	it('honours integers of 1 or more', () => {
		process.env.KEY_EXPORT_MAX_CONCURRENCY = '1';
		expect(getMaxExportConcurrency()).toBe(1);
		process.env.KEY_EXPORT_MAX_CONCURRENCY = '5';
		expect(getMaxExportConcurrency()).toBe(5);
	});
});

describe('tryAcquireExportSlot', () => {
	it('limits the process to the configured concurrency and frees slots on release', () => {
		const a = tryAcquireExportSlot('a');
		const b = tryAcquireExportSlot('b');
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(tryAcquireExportSlot('c')).toBeNull();
		a!();
		a!(); // double release must not free a second slot
		const c = tryAcquireExportSlot('c');
		expect(c).not.toBeNull();
		expect(tryAcquireExportSlot('d')).toBeNull();
		b!();
		c!();
	});

	it('allows one concurrent export per customer', () => {
		const a = tryAcquireExportSlot('a');
		expect(tryAcquireExportSlot('a')).toBeNull();
		a!();
		const again = tryAcquireExportSlot('a');
		expect(again).not.toBeNull();
		again!();
	});
});

describe('respondWithEncryptedExport concurrency', () => {
	it('answers 429 EXPORT_BUSY with Retry-After for a second concurrent export by the same customer', async () => {
		let unblock!: () => void;
		const gate = new Promise<void>((resolve) => (unblock = resolve));
		const first = respondWithEncryptedExport(req, mockResponse('cust-1') as unknown as Response, async () => {
			await gate;
			return { k: 1 };
		});
		const res = mockResponse('cust-1');
		const spy = jest.fn(async () => ({ k: 2 }));
		await respondWithEncryptedExport(req, res as unknown as Response, spy);
		expect(res.statusCode).toBe(429);
		expect(res.headers['Retry-After']).toBe('5');
		expect(res.body).toEqual({ error: 'Too many export requests, try again shortly', code: 'EXPORT_BUSY' });
		expect(spy).not.toHaveBeenCalled();
		unblock();
		await first;
	});

	it('answers 429 when the process limit is reached', async () => {
		process.env.KEY_EXPORT_MAX_CONCURRENCY = '1';
		let unblock!: () => void;
		const gate = new Promise<void>((resolve) => (unblock = resolve));
		const first = respondWithEncryptedExport(req, mockResponse('cust-1') as unknown as Response, async () => {
			await gate;
			return {};
		});
		const res = mockResponse('cust-2');
		await respondWithEncryptedExport(req, res as unknown as Response, async () => ({}));
		expect(res.statusCode).toBe(429);
		unblock();
		await first;
	});

	it('releases the slot after success and after a producer error', async () => {
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const failing = mockResponse('cust-1');
		await respondWithEncryptedExport(req, failing as unknown as Response, async () => {
			throw new Error('boom');
		});
		expect(failing.statusCode).toBe(500);
		const ok = mockResponse('cust-1');
		await respondWithEncryptedExport(req, ok as unknown as Response, async () => ({ k: 1 }));
		expect(ok.statusCode).toBe(200);
		const again = mockResponse('cust-1');
		await respondWithEncryptedExport(req, again as unknown as Response, async () => ({ k: 1 }));
		expect(again.statusCode).toBe(200);
		errorSpy.mockRestore();
	});

	it('does not take a slot for requests rejected on password validation', async () => {
		const bad = mockResponse('cust-1');
		await respondWithEncryptedExport({ body: {} } as Request, bad as unknown as Response, async () => ({}));
		expect(bad.statusCode).toBe(400);
		const ok = mockResponse('cust-1');
		await respondWithEncryptedExport(req, ok as unknown as Response, async () => ({}));
		expect(ok.statusCode).toBe(200);
	});
});
