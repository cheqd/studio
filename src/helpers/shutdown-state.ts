/**
 * Whether the process has begun an orderly shutdown. Readiness reports not-ready, and background work that would
 * otherwise start from a request (the opportunistic ledger indexer, the faucet retention cleanup) is skipped.
 */
let shuttingDown = false;

export function isShuttingDown(): boolean {
	return shuttingDown;
}

export function beginShutdown(): void {
	shuttingDown = true;
}

/** For tests only. */
export function resetShutdownStateForTests(): void {
	shuttingDown = false;
}
