import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
	createGracefulShutdown,
	DEFAULT_SHUTDOWN_GRACE_SECONDS,
	shutdownGraceSeconds,
} from '../../../src/helpers/graceful-shutdown.js';
import { isShuttingDown, resetShutdownStateForTests } from '../../../src/helpers/shutdown-state.js';

afterEach(() => resetShutdownStateForTests());

/** A fake server whose `close` callback fires only when the test says the last request has finished. */
function fakeServer() {
	let finish: () => void = () => undefined;
	return {
		close: jest.fn((callback?: (error?: Error) => void) => {
			finish = () => callback?.();
		}),
		closeIdleConnections: jest.fn(),
		closeAllConnections: jest.fn(),
		finishRequests: () => finish(),
	};
}

function build(overrides: Partial<Parameters<typeof createGracefulShutdown>[0]> = {}) {
	const server = fakeServer();
	const order: string[] = [];
	const exit = jest.fn();
	const log = jest.fn();
	const runtimeShutdown = jest.fn(async () => {
		order.push('runtime');
	});
	const shutdown = createGracefulShutdown({
		server,
		graceSeconds: 5,
		pollIntervalMs: 5,
		steps: [
			{ name: 'runtime', run: runtimeShutdown },
			{ name: 'lock pool', run: async () => void order.push('lock pool') },
			{ name: 'database pool', run: async () => void order.push('database pool') },
		],
		markNotReady: () => order.push('not-ready'),
		exit,
		log,
		...overrides,
	});
	return { server, order, exit, log, runtimeShutdown, shutdown };
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('graceful shutdown', () => {
	it('on a signal stops accepting connections and flips readiness at once', async () => {
		const { server, order, shutdown, exit } = build();
		void shutdown.handleSignal('SIGTERM');
		await tick();
		expect(server.close).toHaveBeenCalledTimes(1);
		expect(order).toEqual(['not-ready']);
		expect(isShuttingDown()).toBe(true);
		expect(exit).not.toHaveBeenCalled();
	});

	it('waits for in-flight requests, then cleans up in order and exits 0', async () => {
		const { server, order, shutdown, exit, runtimeShutdown } = build();
		const done = shutdown.handleSignal('SIGTERM');
		await tick();
		expect(runtimeShutdown).not.toHaveBeenCalled();
		server.finishRequests();
		await done;
		expect(order).toEqual(['not-ready', 'runtime', 'lock pool', 'database pool']);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('also waits for queued ledger writes that already started', async () => {
		let pending = 1;
		const { server, shutdown, exit, runtimeShutdown } = build({ pendingWork: () => pending });
		const done = shutdown.handleSignal('SIGTERM');
		server.finishRequests();
		await tick();
		expect(runtimeShutdown).not.toHaveBeenCalled();
		pending = 0;
		await done;
		expect(runtimeShutdown).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('exits 1 with a logged reason when the deadline passes, still running cleanup', async () => {
		const { server, shutdown, exit, log, runtimeShutdown } = build({ graceSeconds: 0.05 });
		await shutdown.handleSignal('SIGTERM');
		expect(server.closeAllConnections).toHaveBeenCalled();
		expect(runtimeShutdown).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(1);
		expect(log.mock.calls.map((call) => String(call[0])).join('\n')).toContain('deadline');
	});

	it('exits 1 when a cleanup step fails, and carries on with the rest', async () => {
		const order: string[] = [];
		const { server, shutdown, exit } = build({
			steps: [
				{
					name: 'runtime',
					run: async () => {
						throw new Error('detail');
					},
				},
				{ name: 'database pool', run: async () => void order.push('database pool') },
			],
		});
		const done = shutdown.handleSignal('SIGTERM');
		server.finishRequests();
		await done;
		expect(order).toContain('database pool');
		expect(exit).toHaveBeenCalledWith(1);
	});

	it('exits immediately on a second signal', async () => {
		const { shutdown, exit, log } = build();
		void shutdown.handleSignal('SIGTERM');
		await tick();
		void shutdown.handleSignal('SIGINT');
		expect(exit).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(1);
		expect(String(log.mock.calls.at(-1)?.[0])).toContain('immediately');
	});

	it('is idempotent: a second shutdown call does nothing more', async () => {
		const { server, shutdown, exit, runtimeShutdown } = build();
		const first = shutdown.shutdown();
		const second = shutdown.shutdown();
		expect(second).toBe(first);
		server.finishRequests();
		await first;
		expect(server.close).toHaveBeenCalledTimes(1);
		expect(runtimeShutdown).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
	});

	it('logs one line per phase without any step error detail', async () => {
		const { server, shutdown, log } = build({
			steps: [
				{
					name: 'runtime',
					run: async () => {
						throw new Error('postgres://user:password@host/db');
					},
				},
			],
		});
		const done = shutdown.handleSignal('SIGTERM');
		server.finishRequests();
		await done;
		const lines = log.mock.calls.map((call) => String(call[0]));
		expect(lines.every((line) => !line.includes('\n') && !line.includes('password'))).toBe(true);
		expect(lines.length).toBeGreaterThanOrEqual(4);
	});
});

describe('SHUTDOWN_GRACE_SECONDS', () => {
	it('defaults to 25 and ignores unusable values', () => {
		expect(DEFAULT_SHUTDOWN_GRACE_SECONDS).toBe(25);
		expect(shutdownGraceSeconds({})).toBe(25);
		expect(shutdownGraceSeconds({ SHUTDOWN_GRACE_SECONDS: '10' })).toBe(10);
		for (const bad of ['0', '-3', 'abc', '1.5', ' ']) {
			expect(shutdownGraceSeconds({ SHUTDOWN_GRACE_SECONDS: bad })).toBe(25);
		}
	});
});
