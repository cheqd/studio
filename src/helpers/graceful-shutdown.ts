import { beginShutdown } from './shutdown-state.js';

/** The part of `http.Server` that shutdown uses, so tests can pass a fake. */
export interface ClosableServer {
	close(callback?: (error?: Error) => void): unknown;
	closeIdleConnections?(): void;
	closeAllConnections?(): void;
}

export interface ShutdownStep {
	/** Short generic name, logged on failure */
	name: string;
	run: () => Promise<unknown> | unknown;
}

export interface GracefulShutdownOptions {
	server: ClosableServer;
	/** Longest wait for in-flight work, in seconds */
	graceSeconds: number;
	/** Work that is not an HTTP request but must finish first (queued per-payer ledger writes). 0 means idle. */
	pendingWork?: () => number;
	/** Run in order once the drain is over (runtime, lock pool, main pool, analytics) */
	steps: ShutdownStep[];
	/** Called as shutdown begins; readiness must report not-ready from then on */
	markNotReady?: () => void;
	exit: (code: number) => void;
	log?: (line: string) => void;
	/** How long the cleanup steps may take once the drain is over or the deadline has passed */
	cleanupTimeoutMs?: number;
	pollIntervalMs?: number;
}

export const DEFAULT_SHUTDOWN_GRACE_SECONDS = 25;

/** Reads SHUTDOWN_GRACE_SECONDS: a positive integer, else the default. */
export function shutdownGraceSeconds(env: Record<string, string | undefined> = process.env): number {
	const raw = env.SHUTDOWN_GRACE_SECONDS?.trim();
	if (!raw) return DEFAULT_SHUTDOWN_GRACE_SECONDS;
	const value = Number(raw);
	return Number.isInteger(value) && value > 0 ? value : DEFAULT_SHUTDOWN_GRACE_SECONDS;
}

/**
 * Orderly shutdown: stop accepting connections, report not-ready, wait (bounded) for in-flight requests and queued
 * ledger writes, then run the cleanup steps and exit 0, or exit 1 when the deadline passed or a step failed.
 *
 * `shutdown` is idempotent (a second call returns the first run). `handleSignal` starts it on the first signal and
 * forces an immediate exit 1 on the second.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions) {
	const log = options.log ?? ((line: string) => console.log(line));
	const poll = options.pollIntervalMs ?? 100;
	const cleanupTimeout = options.cleanupTimeoutMs ?? 3000;
	let running: Promise<void> | undefined;
	let signals = 0;

	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

	async function drain(): Promise<boolean> {
		let timer: NodeJS.Timeout | undefined;
		let expired = false;
		const deadline = new Promise<void>((resolve) => {
			timer = setTimeout(() => {
				expired = true;
				resolve();
			}, options.graceSeconds * 1000);
		});
		const serverClosed = new Promise<void>((resolve) => {
			try {
				options.server.close(() => resolve());
			} catch {
				resolve();
			}
		});
		const idle = (async () => {
			// Keep-alive connections that finish their last response while closing would otherwise hold the server open
			while (!expired && (options.pendingWork?.() ?? 0) > 0) {
				options.server.closeIdleConnections?.();
				await sleep(poll);
			}
		})();
		const requestsIdle = (async () => {
			while (!expired) {
				options.server.closeIdleConnections?.();
				const settled = await Promise.race([serverClosed.then(() => true), sleep(poll).then(() => false)]);
				if (settled) return;
			}
		})();
		await Promise.race([Promise.all([requestsIdle, idle]), deadline]);
		clearTimeout(timer);
		return !expired;
	}

	async function cleanup(): Promise<boolean> {
		let ok = true;
		const work = (async () => {
			for (const step of options.steps) {
				try {
					await step.run();
					log(`shutdown: ${step.name} done`);
				} catch {
					ok = false;
					log(`shutdown: ${step.name} failed`);
				}
			}
		})();
		let timer: NodeJS.Timeout | undefined;
		const timedOut = new Promise<boolean>((resolve) => {
			timer = setTimeout(() => resolve(true), cleanupTimeout);
		});
		const expired = await Promise.race([work.then(() => false), timedOut]);
		clearTimeout(timer);
		if (expired) log('shutdown: cleanup did not finish in time');
		return ok && !expired;
	}

	async function run(reason: string): Promise<void> {
		beginShutdown();
		options.markNotReady?.();
		log(`shutdown: ${reason} received, no longer accepting connections`);
		const drained = await drain();
		if (drained) {
			log('shutdown: in-flight work finished');
		} else {
			log(`shutdown: deadline of ${options.graceSeconds}s passed with work still in flight`);
			options.server.closeAllConnections?.();
		}
		const cleaned = await cleanup();
		const code = drained && cleaned ? 0 : 1;
		log(`shutdown: exiting with code ${code}`);
		options.exit(code);
	}

	function shutdown(reason = 'shutdown'): Promise<void> {
		running ??= run(reason);
		return running;
	}

	function handleSignal(signal: string): Promise<void> {
		signals++;
		if (signals > 1) {
			log(`shutdown: second ${signal} received, exiting immediately`);
			options.exit(1);
			return running ?? Promise.resolve();
		}
		return shutdown(signal);
	}

	return { shutdown, handleSignal, isRunning: () => running !== undefined };
}
