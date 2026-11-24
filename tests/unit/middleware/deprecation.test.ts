import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
	ENCRYPTED_STATUS_LIST_DEPRECATION_DATE_ENV,
	ENCRYPTED_STATUS_LIST_SUNSET_DATE_ENV,
	deprecateEncryptedStatusListCreation,
	deprecation,
	parseDateEnv,
} from '../../../src/middleware/deprecation.js';

const DEPRECATED_AT = new Date('2026-11-16T00:00:00Z');
const SUNSET_AT = new Date('2026-11-30T00:00:00Z');

let server: Server;
let now: Date;

const start = async (middleware: express.RequestHandler): Promise<string> => {
	const app = express();
	app.post('/guarded', middleware, (_req, res) => res.json({ ok: true }));
	app.post('/other', (_req, res) => res.json({ ok: true }));
	await new Promise<void>((resolve) => {
		server = app.listen(0, () => resolve());
	});
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

afterEach(async () => {
	jest.restoreAllMocks();
	delete process.env[ENCRYPTED_STATUS_LIST_DEPRECATION_DATE_ENV];
	delete process.env[ENCRYPTED_STATUS_LIST_SUNSET_DATE_ENV];
	if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
	now = new Date('2026-11-20T00:00:00Z');
});

describe('deprecation middleware', () => {
	it('adds Deprecation (RFC 9745) and Sunset (RFC 8594) headers before the sunset date', async () => {
		const base = await start(
			deprecation({ deprecatedAt: () => DEPRECATED_AT, sunsetAt: () => SUNSET_AT, now: () => now })
		);
		const res = await fetch(`${base}/guarded`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(res.headers.get('deprecation')).toBe(`@${DEPRECATED_AT.getTime() / 1000}`);
		expect(res.headers.get('sunset')).toBe('Mon, 30 Nov 2026 00:00:00 GMT');
		expect(res.headers.get('link')).toBeNull();
	});

	it('adds a Link rel="deprecation" header when a URL is configured', async () => {
		const base = await start(
			deprecation({
				deprecatedAt: () => DEPRECATED_AT,
				sunsetAt: () => SUNSET_AT,
				now: () => now,
				link: 'https://example.com/d',
			})
		);
		const res = await fetch(`${base}/guarded`, { method: 'POST' });
		expect(res.headers.get('link')).toBe('<https://example.com/d>; rel="deprecation"');
	});

	it('returns 410 Gone with a JSON error once the sunset date has passed, still sending headers', async () => {
		now = new Date('2026-11-30T00:00:01Z');
		const base = await start(
			deprecation({
				deprecatedAt: () => DEPRECATED_AT,
				sunsetAt: () => SUNSET_AT,
				now: () => now,
				message: 'Gone for good.',
			})
		);
		const res = await fetch(`${base}/guarded`, { method: 'POST' });
		expect(res.status).toBe(410);
		expect(res.headers.get('sunset')).toBe('Mon, 30 Nov 2026 00:00:00 GMT');
		expect(res.headers.get('deprecation')).toBe(`@${DEPRECATED_AT.getTime() / 1000}`);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('Gone for good.');
	});

	it('fails safe: with no sunset date it sends Deprecation only and never returns 410', async () => {
		const base = await start(
			deprecation({
				deprecatedAt: () => DEPRECATED_AT,
				sunsetAt: () => undefined,
				now: () => new Date('2099-01-01'),
			})
		);
		const res = await fetch(`${base}/guarded`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(res.headers.get('deprecation')).toBe(`@${DEPRECATED_AT.getTime() / 1000}`);
		expect(res.headers.get('sunset')).toBeNull();
	});

	it('does not affect routes it is not mounted on', async () => {
		const base = await start(
			deprecation({
				deprecatedAt: () => DEPRECATED_AT,
				sunsetAt: () => SUNSET_AT,
				now: () => new Date('2099-01-01'),
			})
		);
		const res = await fetch(`${base}/other`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(res.headers.get('deprecation')).toBeNull();
		expect(res.headers.get('sunset')).toBeNull();
	});
});

describe('parseDateEnv', () => {
	it('parses ISO dates and ignores unset, blank or invalid values (invalid ones with a warning)', () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		expect(parseDateEnv('2026-11-30T00:00:00Z', 'X')?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
		expect(parseDateEnv(undefined, 'X')).toBeUndefined();
		expect(parseDateEnv('  ', 'X')).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
		expect(parseDateEnv('next tuesday', 'X')).toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe('deprecateEncryptedStatusListCreation (environment driven)', () => {
	it('uses the documented default deprecation date and no sunset when nothing is set', async () => {
		const base = await start(deprecateEncryptedStatusListCreation);
		const res = await fetch(`${base}/guarded`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(res.headers.get('deprecation')).toMatch(/^@\d+$/);
		expect(res.headers.get('sunset')).toBeNull();
	});

	it('reads both dates from the environment at request time', async () => {
		process.env[ENCRYPTED_STATUS_LIST_DEPRECATION_DATE_ENV] = '2026-11-16T00:00:00Z';
		process.env[ENCRYPTED_STATUS_LIST_SUNSET_DATE_ENV] = '2020-01-01T00:00:00Z';
		const base = await start(deprecateEncryptedStatusListCreation);
		const res = await fetch(`${base}/guarded`, { method: 'POST' });
		expect(res.status).toBe(410);
		expect(res.headers.get('deprecation')).toBe(`@${DEPRECATED_AT.getTime() / 1000}`);
		expect((await res.json()).error).toMatch(/unencrypted/i);
	});
});

describe('route wiring in app.ts', () => {
	const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/app.ts'), 'utf8');
	const routeBlock = (route: string): string => {
		const start = source.indexOf(`'${route}'`);
		expect(start).toBeGreaterThan(-1);
		return source.slice(start, source.indexOf(');', start));
	};

	it('guards only POST /credential-status/create/encrypted', () => {
		expect(routeBlock('/credential-status/create/encrypted')).toContain('deprecateEncryptedStatusListCreation');
		expect(source.match(/deprecateEncryptedStatusListCreation/g)?.length).toBe(2); // import + one use
	});

	it.each([
		'/credential-status/update/encrypted',
		'/credential-status/check',
		'/credential-status/create/unencrypted',
		'/credential-status/update/unencrypted',
	])('leaves %s untouched', (route) => {
		expect(routeBlock(route)).not.toMatch(/deprecat/i);
	});

	it('leaves reading existing lists untouched', () => {
		const get = source.slice(
			source.indexOf('/credential-status/search'),
			source.indexOf('/credential-status/search') + 300
		);
		expect(get).not.toMatch(/deprecat/i);
	});
});
