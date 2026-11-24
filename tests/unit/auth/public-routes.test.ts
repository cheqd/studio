import { afterEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import type { Request, Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ipRateLimiter, isRateLimitExempt } from '../../../src/middleware/rate-limit.js';
import { userInfo } from '../../../src/middleware/auth/user-info-route.js';

/** Public by owner decision (F-12): lookups of public ledger data. */
const PUBLIC_LOOKUPS = [
	{ path: '/did/search/:did', openApi: '/did/search/{did}', sample: '/did/search/did:cheqd:testnet:abc' },
	{
		path: '/resource/search/:did',
		openApi: '/resource/search/{did}',
		sample: '/resource/search/did:cheqd:testnet:abc',
	},
	{ path: '/credential-status/search', openApi: '/credential-status/search', sample: '/credential-status/search' },
];

let server: Server | undefined;
afterEach(async () => {
	await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
	server = undefined;
});

describe('public ledger lookups (F-12)', () => {
	it.each(PUBLIC_LOOKUPS)('$path is not exempt from the rate limiter', ({ sample }) => {
		expect(isRateLimitExempt({ path: sample })).toBe(false);
	});

	it('limits each lookup per IP address', async () => {
		const app = express();
		app.use(ipRateLimiter({ enabled: true, windowSeconds: 60, ipMax: 2, customerMax: 100 }));
		for (const { path } of PUBLIC_LOOKUPS) app.get(path, (_req, res) => res.json({ ok: true }));
		server = await new Promise<Server>((resolve) => {
			const s = app.listen(0, '127.0.0.1', () => resolve(s));
		});
		const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const statuses = [];
		for (const { sample } of PUBLIC_LOOKUPS) statuses.push((await fetch(`${base}${sample}`)).status);
		expect(statuses).toEqual([200, 200, 429]);
	});

	it('documents exactly these operations as needing no API key', () => {
		const spec = JSON.parse(readFileSync(join(process.cwd(), 'src/static/swagger-api.json'), 'utf-8')) as {
			paths: Record<string, Record<string, { security?: unknown[] }>>;
		};
		const publicOps = Object.entries(spec.paths)
			.flatMap(([path, ops]) =>
				Object.entries(ops)
					.filter(([, op]) => Array.isArray(op.security) && op.security.length === 0)
					.map(([method]) => `${method.toUpperCase()} ${path}`)
			)
			.sort();
		expect(publicOps).toEqual(PUBLIC_LOOKUPS.map(({ openApi }) => `GET ${openApi}`).sort());
	});
});

describe('GET /auth/user-info (F-12)', () => {
	const call = (user: unknown) => {
		let body: unknown;
		const response = { json: (b: unknown) => ((body = b), response) };
		userInfo({ user } as unknown as Request, response as unknown as Response);
		return body;
	};

	it('says only that the caller is signed out when there is no session', () => {
		expect(call({ isAuthenticated: false, claims: { sub: 'leftover' }, accessToken: 'x' })).toEqual({
			isAuthenticated: false,
		});
		expect(call(undefined)).toEqual({ isAuthenticated: false });
	});

	it("returns the signed-in caller's own session user", () => {
		const user = { isAuthenticated: true, claims: { sub: 'user-1' } };
		expect(call(user)).toEqual(user);
	});
});
