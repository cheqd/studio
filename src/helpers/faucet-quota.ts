/**
 * Helpers for the per-customer monthly faucet quota.
 * The quota window is the current calendar month in UTC.
 */

export interface FaucetQuotaWindow {
	start: Date;
	resetsAt: Date;
}

/** Calendar-month (UTC) window containing `now`. */
export function getFaucetQuotaWindow(now: Date = new Date()): FaucetQuotaWindow {
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth();
	return {
		start: new Date(Date.UTC(year, month, 1)),
		resetsAt: new Date(Date.UTC(year, month + 1, 1)),
	};
}

/** Seconds until the quota window resets, rounded up and never below 1. */
export function secondsUntilReset(window: FaucetQuotaWindow, now: Date = new Date()): number {
	return Math.max(1, Math.ceil((window.resetsAt.getTime() - now.getTime()) / 1000));
}

/** True if `requestedNcheq` fits in what is left of `limitNcheq` after `usedNcheq`. */
export function fitsInQuota(usedNcheq: bigint, requestedNcheq: bigint, limitNcheq: bigint): boolean {
	return usedNcheq + requestedNcheq <= limitNcheq;
}

/** Remaining quota, never negative. */
export function remainingQuota(usedNcheq: bigint, limitNcheq: bigint): bigint {
	return usedNcheq >= limitNcheq ? 0n : limitNcheq - usedNcheq;
}
