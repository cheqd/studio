import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { requestContext } from '../../../src/middleware/request-context.js';
import {
	hideInternalErrors,
	internalErrorHandler,
	INTERNAL_ERROR_MESSAGE,
} from '../../../src/middleware/internal-errors.js';

const SECRET_DETAIL = 'relation "customer" column "paymentProviderId" violates constraint at db.internal:5432';

let server: Server | undefined;
let logged: unknown[][] = [];

async function start(): Promise<string> {
	const app = express();
	app.use(express.json());
	app.use(requestContext);
	app.use(hideInternalErrors);
	app.get('/json-500', (_req, res) => {
		res.status(500).json({ error: `Internal error: ${SECRET_DETAIL}` });
	});
	app.get('/send-500', (_req, res) => {
		res.status(500).send({ error: `Internal error: ${SECRET_DETAIL}`, details: SECRET_DETAIL });
	});
	app.get('/text-500', (_req, res) => {
		res.status(500).send(`Unexpected error: ${SECRET_DETAIL}`);
	});
	app.get('/coded-500', (_req, res) => {
		res.status(500).json({ error: SECRET_DETAIL, code: 'CredoTenantMissing' });
	});
	app.get('/throws', () => {
		throw Object.assign(new Error(SECRET_DETAIL), { code: '23505' });
	});
	app.get('/rejects', async () => {
		throw new Error(SECRET_DETAIL);
	});
	app.get('/400', (_req, res) => {
		res.status(400).json({ error: 'subscriptionId was not provided' });
	});
	app.get('/404', (_req, res) => {
		res.status(404).json({ error: 'Subscription was not found' });
	});
	app.get('/503', (_req, res) => {
		res.status(503).json({ error: 'The testnet faucet is temporarily unavailable. Please try again later.' });
	});
	app.post('/json-body', (_req, res) => {
		res.json({ ok: true });
	});
	app.use(internalErrorHandler);
	server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, '127.0.0.1', () => resolve(s));
	});
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
	logged = [];
	jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		logged.push(args);
	});
});
afterEach(async () => {
	jest.restoreAllMocks();
	await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
	server = undefined;
});

describe('500 responses hide internal errors', () => {
	it.each(['/json-500', '/send-500', '/text-500', '/throws', '/rejects'])(
		'%s returns a generic message and an error id, and logs the detail with that id',
		async (path) => {
			const base = await start();
			const response = await fetch(`${base}${path}`);
			const text = await response.text();
			expect(response.status).toBe(500);
			expect(text).not.toContain('paymentProviderId');
			expect(text).not.toContain('db.internal');
			expect(text).not.toContain('23505');
			const body = JSON.parse(text) as { error: string; errorId: string };
			expect(Object.keys(body).sort()).toEqual(['error', 'errorId']);
			expect(body.error).toBe(INTERNAL_ERROR_MESSAGE);
			expect(body.errorId).toMatch(/^[0-9a-f-]{36}$/);
			const line = logged.find((args) => String(args[0]).includes(body.errorId));
			expect(line).toBeDefined();
			expect(JSON.stringify(line?.[1] ?? '') + String((line?.[1] as Error)?.message ?? '')).toContain(
				'paymentProviderId'
			);
		}
	);

	it('gives each failure its own error id', async () => {
		const base = await start();
		const first = (await (await fetch(`${base}/json-500`)).json()) as { errorId: string };
		const second = (await (await fetch(`${base}/json-500`)).json()) as { errorId: string };
		expect(first.errorId).not.toBe(second.errorId);
	});

	it('keeps a machine-readable code from a response body', async () => {
		const base = await start();
		const body = (await (await fetch(`${base}/coded-500`)).json()) as Record<string, string>;
		expect(body.code).toBe('CredoTenantMissing');
		expect(body.error).toBe(INTERNAL_ERROR_MESSAGE);
	});

	it.each([
		['/400', 400, 'subscriptionId was not provided'],
		['/404', 404, 'Subscription was not found'],
		['/503', 503, 'The testnet faucet is temporarily unavailable. Please try again later.'],
	])('leaves the deliberate message of %s alone', async (path, status, message) => {
		const base = await start();
		const response = await fetch(`${base}${path}`);
		expect(response.status).toBe(status);
		expect(await response.json()).toEqual({ error: message });
		expect(logged).toEqual([]);
	});

	it('answers a malformed JSON body with its 400, not a 500', async () => {
		const base = await start();
		const response = await fetch(`${base}/json-body`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{not json',
		});
		expect(response.status).toBe(400);
	});
});
