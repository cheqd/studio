import { afterEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { jsonBodyParsers, bodyLimits } from '../../../src/middleware/body-parsers.js';
import {
	createRateLimiter,
	customerRateLimiter,
	ipRateLimiter,
	isRateLimitExempt,
	rateLimitConfig,
	trustProxySetting,
} from '../../../src/middleware/rate-limit.js';

const servers: Server[] = [];
async function listen(app: express.Application): Promise<string> {
	const server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, '127.0.0.1', () => resolve(s));
	});
	servers.push(server);
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
	await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

const config = { enabled: true, windowSeconds: 60, ipMax: 3, customerMax: 2 };

describe('rate limiting', () => {
	it('answers 429 with Retry-After once the per-IP limit is exceeded, and never counts exempt paths', async () => {
		const app = express();
		app.use(ipRateLimiter(config));
		app.get('/{*path}', (_req, res) => res.json({ ok: true }));
		const base = await listen(app);

		for (let i = 0; i < 3; i++) expect((await fetch(`${base}/did/search/x`)).status).toBe(200);
		const limited = await fetch(`${base}/did/search/x`);
		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(await limited.json()).toMatchObject({ code: 'rate_limited' });

		for (const path of ['/', '/health', '/healthz/', '/ready', '/swagger/index.html']) {
			for (let i = 0; i < 5; i++) expect((await fetch(`${base}${path}`)).status).toBe(200);
		}
	});

	it('limits per customer and keeps customers apart', async () => {
		const app = express();
		app.use((req, res, next) => {
			const id = req.header('x-test-customer');
			if (id) res.locals.customer = { customerId: id };
			next();
		});
		app.use(customerRateLimiter(config));
		app.get('/x', (_req, res) => res.json({ ok: true }));
		const base = await listen(app);
		const call = (customer?: string) =>
			fetch(`${base}/x`, { headers: customer ? { 'x-test-customer': customer } : {} }).then((r) => r.status);

		expect([await call('a'), await call('a'), await call('a')]).toEqual([200, 200, 429]);
		expect(await call('b')).toBe(200);
		// requests with no customer are not counted here (the IP limiter covers them)
		for (let i = 0; i < 5; i++) expect(await call()).toBe(200);
	});

	it('starts a new window after the old one ends', async () => {
		let now = 1_000;
		const limiter = createRateLimiter({ windowMs: 1000, max: 1, key: () => 'k', now: () => now });
		const app = express();
		app.use(limiter);
		app.get('/x', (_req, res) => res.json({}));
		const base = await listen(app);
		expect((await fetch(`${base}/x`)).status).toBe(200);
		expect((await fetch(`${base}/x`)).status).toBe(429);
		now += 1001;
		expect((await fetch(`${base}/x`)).status).toBe(200);
	});

	it('bounds the number of tracked keys', async () => {
		let n = 0;
		const limiter = createRateLimiter({ windowMs: 60_000, max: 1, key: () => `k${n++}`, maxKeys: 5 });
		const app = express();
		app.use(limiter);
		app.get('/x', (_req, res) => res.json({}));
		const base = await listen(app);
		for (let i = 0; i < 20; i++) expect((await fetch(`${base}/x`)).status).toBe(200);
	});

	it('reads limits from the environment and ignores invalid values', () => {
		expect(rateLimitConfig({})).toEqual({ enabled: true, windowSeconds: 60, ipMax: 1000, customerMax: 600 });
		expect(
			rateLimitConfig({ RATE_LIMIT_ENABLED: 'false', RATE_LIMIT_IP_MAX: '50', RATE_LIMIT_CUSTOMER_MAX: 'x' })
		).toMatchObject({ enabled: false, ipMax: 50, customerMax: 600 });
		expect(trustProxySetting(undefined)).toBeUndefined();
		expect(trustProxySetting('1')).toBe(1);
		expect(trustProxySetting('true')).toBe(true);
		expect(trustProxySetting('loopback')).toBe('loopback');
		expect(isRateLimitExempt({ path: '/did/create' })).toBe(false);
		expect(isRateLimitExempt({ path: '/healthcheck-not-exempt' })).toBe(false);
	});
});

describe('JSON body limits', () => {
	async function server() {
		const app = express();
		for (const { path, handler } of jsonBodyParsers(() => undefined, { defaultLimit: '1kb', largeLimit: '10kb' })) {
			if (path) app.use(path, handler);
			else app.use(handler);
		}
		app.post('/{*path}', (req, res) => res.json({ size: JSON.stringify(req.body).length }));
		return listen(app);
	}
	const post = (base: string, path: string, size: number) =>
		fetch(`${base}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ data: 'x'.repeat(size) }),
		}).then((r) => r.status);

	it('refuses a body over the default limit on ordinary routes', async () => {
		const base = await server();
		expect(await post(base, '/did/create', 100)).toBe(200);
		expect(await post(base, '/did/create', 5000)).toBe(413);
		expect(await post(base, '/credential/issue', 5000)).toBe(413);
	});

	it('allows the larger limit only on the documented routes', async () => {
		const base = await server();
		expect(await post(base, '/resource/create/did:cheqd:testnet:abc', 5000)).toBe(200);
		expect(await post(base, '/credentials/import', 5000)).toBe(200);
		expect(await post(base, '/admin/webhook', 5000)).toBe(200);
		expect(await post(base, '/resource/create/did:cheqd:testnet:abc', 20000)).toBe(413);
	});

	it('defaults to 1mb and 10mb', () => {
		expect(bodyLimits({})).toEqual({ defaultLimit: '1mb', largeLimit: '10mb' });
		expect(bodyLimits({ JSON_BODY_LIMIT: '2mb' }).defaultLimit).toBe('2mb');
	});
});
