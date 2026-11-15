import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { requireFreshSignIn } from '../../../src/middleware/fresh-signin.js';

// Runs the real requireFreshSignIn middleware over HTTP on the three protected paths. The stub stands in for the
// id-token / portal-token fetchers, which set res.locals.authTime from the `auth_time` claim; M2M tokens and API
// keys never set it.
const ROUTES: Array<['post' | 'delete', string]> = [
	['post', '/did/export/did:cheqd:testnet:abc'],
	['post', '/account/export-keys'],
	['delete', '/account'],
];

let server: Server;
let base: string;

beforeAll(async () => {
	const app = express();
	const stubAuth = (request: Request, response: Response, next: NextFunction) => {
		const header = request.header('x-test-auth-time');
		if (header !== undefined) response.locals.authTime = Number(header);
		next();
	};
	const handler = (_request: Request, response: Response) => response.status(200).json({ ok: true });
	app.post('/did/export/:did', stubAuth, requireFreshSignIn(), handler);
	app.post('/account/export-keys', stubAuth, requireFreshSignIn(), handler);
	app.delete('/account', stubAuth, requireFreshSignIn(), handler);
	await new Promise<void>((resolve) => {
		server = app.listen(0, '127.0.0.1', () => resolve());
	});
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
});

const call = (method: string, path: string, authTime?: number) =>
	fetch(base + path, {
		method,
		headers: authTime === undefined ? {} : { 'x-test-auth-time': String(authTime) },
	});

describe.each(ROUTES)('requireFreshSignIn over HTTP: %s %s', (method, path) => {
	it('rejects a token without auth_time (M2M token or API key) with 401 REAUTHENTICATION_REQUIRED', async () => {
		const res = await call(method, path);
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain('insufficient_user_authentication');
		expect(await res.json()).toMatchObject({ code: 'REAUTHENTICATION_REQUIRED' });
	});

	it('rejects a stale auth_time with 401', async () => {
		const res = await call(method, path, Math.floor(Date.now() / 1000) - 3600);
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain('max_age=300');
		expect(await res.json()).toMatchObject({ code: 'REAUTHENTICATION_REQUIRED' });
	});

	it('lets a fresh auth_time through to the handler', async () => {
		const res = await call(method, path, Math.floor(Date.now() / 1000) - 10);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});
});
