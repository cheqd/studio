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

export type FaucetAmountResolution =
	| { status: 'ok'; amountNcheq: bigint }
	| { status: 'cap_reached' }
	| { status: 'invalid' };

/**
 * Decides how much to fund.
 * - No amount requested: top the account up to the per-account balance cap (`capRemainingNcheq`).
 * - Amount requested: the per-request maximum is the monthly quota, so the balance cap is not applied
 *   and the quota check at reservation time is the only upper bound.
 */
export function resolveFaucetAmount(
	requestedNcheq: bigint | undefined,
	capRemainingNcheq: bigint
): FaucetAmountResolution {
	if (requestedNcheq === undefined) {
		return capRemainingNcheq > 0n ? { status: 'ok', amountNcheq: capRemainingNcheq } : { status: 'cap_reached' };
	}
	return requestedNcheq > 0n ? { status: 'ok', amountNcheq: requestedNcheq } : { status: 'invalid' };
}
