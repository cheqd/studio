import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { FaucetAmountSummary, FaucetQuotaSummary } from '../types/account.js';
import { ncheqToCheq } from './denom.js';

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

/** Most that can be requested now: the lower of the room under the address cap and the quota left, never negative. */
export function maxRequestableNcheq(roomUnderCapNcheq: bigint, quotaRemainingNcheq: bigint): bigint {
	const lowest = roomUnderCapNcheq < quotaRemainingNcheq ? roomUnderCapNcheq : quotaRemainingNcheq;
	return lowest > 0n ? lowest : 0n;
}

/** Remaining quota, never negative. */
export function remainingQuota(usedNcheq: bigint, limitNcheq: bigint): bigint {
	return usedNcheq >= limitNcheq ? 0n : limitNcheq - usedNcheq;
}

export function buildFaucetQuotaSummary(
	usedNcheq: bigint,
	limitNcheq: bigint,
	window: FaucetQuotaWindow
): FaucetQuotaSummary {
	const remainingNcheq = remainingQuota(usedNcheq, limitNcheq);
	const amount = (ncheq: bigint): FaucetAmountSummary => ({ cheq: ncheqToCheq(ncheq), ncheq: ncheq.toString() });
	return {
		period: 'month',
		limit: amount(limitNcheq),
		used: amount(usedNcheq),
		remaining: amount(remainingNcheq),
		resetsAt: window.resetsAt.toISOString(),
	};
}

/** Rows older than this are past retention: the start of the calendar month `retentionMonths` months ago (UTC). */
export function retentionCutoff(now: Date, retentionMonths: number): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - retentionMonths, 1));
}

/** Seconds the customer still has to wait before their next faucet request; 0 if one is allowed now. */
export function secondsUntilNextRequest(
	lastRequestAt: Date | null,
	minIntervalSeconds: number,
	now: Date = new Date()
): number {
	if (!lastRequestAt || minIntervalSeconds <= 0) return 0;
	const remainingMs = minIntervalSeconds * 1000 - (now.getTime() - lastRequestAt.getTime());
	return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/** Room left under an address cap once its balance and requests still in flight are accounted for; never negative. */
export function addressRoomNcheq(capNcheq: bigint, currentBalanceNcheq: bigint, inFlightNcheq: bigint): bigint {
	const room = capNcheq - currentBalanceNcheq - inFlightNcheq;
	return room > 0n ? room : 0n;
}

export interface FaucetAddressCap {
	// Most the address may hold
	capNcheq: bigint;
	// Balance read from the chain before the reservation; it may not yet include recent transfers
	currentBalanceNcheq: bigint;
	// Requests for the address made in the last this-many seconds are assumed not to be in the balance yet
	settleSeconds: number;
}

export interface FaucetReserveOptions {
	// Most the customer can request per quota window
	limitNcheq: bigint;
	// How long an unconfirmed reservation keeps counting before it is treated as abandoned
	pendingTimeoutSeconds?: number;
	// Minimum gap between two requests from the customer; 0 or undefined disables the check
	minIntervalSeconds?: number;
	// Enforce the address cap under the lock, counting requests still in flight for the same address
	addressCap?: FaucetAddressCap;
}

export type FaucetReservation =
	| { reserved: true; faucetRequestId: string; usedNcheq: bigint; window: FaucetQuotaWindow }
	| { reserved: false; reason: 'quota_exceeded'; usedNcheq: bigint; window: FaucetQuotaWindow }
	| { reserved: false; reason: 'too_frequent'; retryAfterSeconds: number; window: FaucetQuotaWindow }
	| { reserved: false; reason: 'address_cap_exceeded'; roomNcheq: bigint; window: FaucetQuotaWindow };

/** Storage for quota reservations; implemented by `FaucetRequestService` and faked in tests. */
export interface FaucetQuotaLedger {
	reserve(
		customer: CustomerEntity,
		address: string,
		amountNcheq: bigint,
		options: FaucetReserveOptions
	): Promise<FaucetReservation>;
	release(faucetRequestId: string): Promise<void>;
	/** The faucet confirmed the credit. */
	complete(faucetRequestId: string): Promise<void>;
	/** The faucet call threw, so tokens may have been sent: keep counting this reservation permanently. */
	markUnknown(faucetRequestId: string): Promise<void>;
}

async function markUnknownBestEffort(ledger: FaucetQuotaLedger, faucetRequestId: string): Promise<void> {
	try {
		await ledger.markUnknown(faucetRequestId);
	} catch (error) {
		console.error(`Failed to mark faucet request ${faucetRequestId} as unknown:`, error);
	}
}

export type FaucetCreditResult =
	| { outcome: 'quota_exceeded'; usedNcheq: bigint; window: FaucetQuotaWindow }
	| { outcome: 'too_frequent'; retryAfterSeconds: number; window: FaucetQuotaWindow }
	| { outcome: 'address_cap_exceeded'; roomNcheq: bigint }
	// `usedNcheq` already includes the amount just credited.
	| { outcome: 'credited'; usedNcheq: bigint; window: FaucetQuotaWindow }
	| { outcome: 'faucet_failed'; status: number; error: string };

/**
 * Reserves quota, calls the faucet, and settles the reservation.
 * - Quota does not fit: the faucet is not called.
 * - Faucet answers with an error status: it definitely did not credit the account, so the quota is released.
 * - Faucet call throws (e.g. a timeout): the outcome is unknown and tokens may have been sent, so the
 *   reservation is marked unknown and keeps counting for good (over-counting is safer than refunding quota
 *   for tokens that were credited).
 * - Faucet confirms: the reservation is marked completed.
 */
export async function creditWithinQuota(
	ledger: FaucetQuotaLedger,
	delegate: () => Promise<{ status: number; error: string }>,
	params: {
		customer: CustomerEntity;
		address: string;
		amountNcheq: bigint;
		limitNcheq: bigint;
		minIntervalSeconds?: number;
		addressCap?: FaucetAddressCap;
	}
): Promise<FaucetCreditResult> {
	const reservation = await ledger.reserve(params.customer, params.address, params.amountNcheq, {
		limitNcheq: params.limitNcheq,
		minIntervalSeconds: params.minIntervalSeconds,
		addressCap: params.addressCap,
	});
	if (!reservation.reserved) {
		switch (reservation.reason) {
			case 'too_frequent':
				return {
					outcome: 'too_frequent',
					retryAfterSeconds: reservation.retryAfterSeconds,
					window: reservation.window,
				};
			case 'address_cap_exceeded':
				return { outcome: 'address_cap_exceeded', roomNcheq: reservation.roomNcheq };
			default:
				return { outcome: 'quota_exceeded', usedNcheq: reservation.usedNcheq, window: reservation.window };
		}
	}

	let faucet: { status: number; error: string };
	try {
		faucet = await delegate();
	} catch (error) {
		await markUnknownBestEffort(ledger, reservation.faucetRequestId);
		throw error;
	}
	if (faucet.status !== 200) {
		await ledger.release(reservation.faucetRequestId);
		return { outcome: 'faucet_failed', status: faucet.status, error: faucet.error };
	}
	try {
		await ledger.complete(reservation.faucetRequestId);
	} catch (error) {
		// The tokens were sent, so do not fail the request. The reservation stays pending and keeps counting
		// until it times out.
		console.error(`Failed to mark faucet request ${reservation.faucetRequestId} as completed:`, error);
	}
	return {
		outcome: 'credited',
		usedNcheq: reservation.usedNcheq + params.amountNcheq,
		window: reservation.window,
	};
}
