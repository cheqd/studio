import { afterEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { healthRouter } from '../../../src/middleware/health.js';
import { beginShutdown, resetShutdownStateForTests } from '../../../src/helpers/shutdown-state.js';

let server: Server | undefined;
async function start(): Promise<string> {
	const app = express();
	app.use(healthRouter());
	app.get('/other', (_req, res) => res.send('ok'));
	server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, '127.0.0.1', () => resolve(s));
	});
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
	resetShutdownStateForTests();
	await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
	server = undefined;
});

describe('health and readiness', () => {
	it('is ready, and live, before shutdown', async () => {
		const base = await start();
		expect((await fetch(`${base}/ready`)).status).toBe(200);
		expect((await fetch(`${base}/readyz`)).status).toBe(200);
		expect((await fetch(`${base}/health`)).status).toBe(200);
	});

	it('reports not-ready at once when shutdown begins, while staying live', async () => {
		const base = await start();
		beginShutdown();
		for (const path of ['/ready', '/readyz', '/readiness']) {
			expect((await fetch(`${base}${path}`)).status).toBe(503);
		}
		expect((await fetch(`${base}/healthz`)).status).toBe(200);
	});

	it('asks other responses to close the connection during shutdown', async () => {
		const base = await start();
		beginShutdown();
		const response = await fetch(`${base}/other`);
		expect(response.headers.get('connection')).toBe('close');
	});
});
