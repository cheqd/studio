import { afterEach, beforeEach, describe, it, expect, jest } from '@jest/globals';
import {
	addressRoomNcheq,
	buildFaucetQuotaSummary,
	creditWithinQuota,
	fitsInQuota,
	getFaucetQuotaWindow,
	maxRequestableNcheq,
	remainingQuota,
	retentionCutoff,
	secondsUntilNextRequest,
	secondsUntilReset,
	type FaucetLogger,
	type FaucetQuotaLedger,
	type FaucetReservation,
} from '../../../src/helpers/faucet-quota.js';
import type { CustomerEntity } from '../../../src/database/entities/customer.entity.js';

describe('getFaucetQuotaWindow', () => {
	it('returns the calendar month in UTC containing the date', () => {
		const window = getFaucetQuotaWindow(new Date('2026-10-08T15:30:00Z'));
		expect(window.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
		expect(window.resetsAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});

	it('rolls over the year in December', () => {
		const window = getFaucetQuotaWindow(new Date('2026-12-31T23:59:59Z'));
		expect(window.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
		expect(window.resetsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	it('treats the first instant of a month as inside that month', () => {
		const window = getFaucetQuotaWindow(new Date('2026-11-01T00:00:00Z'));
		expect(window.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});

	it('uses UTC rather than local time near a boundary', () => {
		const window = getFaucetQuotaWindow(new Date('2026-10-31T23:30:00-05:00'));
		expect(window.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});
});

describe('secondsUntilReset', () => {
	it('counts seconds to the start of next month', () => {
		const now = new Date('2026-10-31T23:00:00Z');
		expect(secondsUntilReset(getFaucetQuotaWindow(now), now)).toBe(3600);
	});

	it('rounds up and never returns less than 1', () => {
		const now = new Date('2026-10-31T23:59:59.500Z');
		expect(secondsUntilReset(getFaucetQuotaWindow(now), now)).toBe(1);
	});
});

describe('quota arithmetic', () => {
	const limit = 100_000n * 1_000_000_000n;

	it('allows a request that exactly reaches the limit', () => {
		expect(fitsInQuota(limit - 10n, 10n, limit)).toBe(true);
	});

	it('rejects a request that goes one ncheq over the limit', () => {
		expect(fitsInQuota(limit - 10n, 11n, limit)).toBe(false);
	});

	it('rejects any request once the quota is used up', () => {
		expect(fitsInQuota(limit, 1n, limit)).toBe(false);
	});

	it('reports remaining quota and clamps at zero', () => {
		expect(remainingQuota(40_000n * 1_000_000_000n, limit)).toBe(60_000n * 1_000_000_000n);
		expect(remainingQuota(limit + 5n, limit)).toBe(0n);
	});
});

describe('secondsUntilNextRequest', () => {
	const last = new Date('2026-10-08T12:00:00Z');

	it('is 0 when there was no previous request or the interval is disabled', () => {
		expect(secondsUntilNextRequest(null, 10, last)).toBe(0);
		expect(secondsUntilNextRequest(last, 0, last)).toBe(0);
	});

	it('counts the seconds left, rounded up', () => {
		expect(secondsUntilNextRequest(last, 10, new Date('2026-10-08T12:00:04Z'))).toBe(6);
		expect(secondsUntilNextRequest(last, 10, new Date('2026-10-08T12:00:09.200Z'))).toBe(1);
	});

	it('is 0 once the interval has passed', () => {
		expect(secondsUntilNextRequest(last, 10, new Date('2026-10-08T12:00:10Z'))).toBe(0);
		expect(secondsUntilNextRequest(last, 10, new Date('2026-10-08T12:05:00Z'))).toBe(0);
	});
});

describe('retentionCutoff', () => {
	it('is the start of the month N months before the current one (UTC)', () => {
		expect(retentionCutoff(new Date('2026-10-09T12:00:00Z'), 13).toISOString()).toBe('2025-09-01T00:00:00.000Z');
		expect(retentionCutoff(new Date('2026-01-31T23:59:59Z'), 1).toISOString()).toBe('2025-12-01T00:00:00.000Z');
		expect(retentionCutoff(new Date('2026-10-09T12:00:00Z'), 0).toISOString()).toBe('2026-10-01T00:00:00.000Z');
	});
});

describe('addressRoomNcheq', () => {
	it('subtracts the balance and requests still in flight from the cap', () => {
		expect(addressRoomNcheq(100n, 30n, 20n)).toBe(50n);
	});

	it('is never negative', () => {
		expect(addressRoomNcheq(100n, 90n, 20n)).toBe(0n);
		expect(addressRoomNcheq(100n, 150n, 0n)).toBe(0n);
	});
});

describe('maxRequestableNcheq', () => {
	it('is limited by the room under the address cap when that is lower', () => {
		expect(maxRequestableNcheq(10n, 50n)).toBe(10n);
	});

	it('is limited by the quota left when that is lower', () => {
		expect(maxRequestableNcheq(50n, 10n)).toBe(10n);
	});

	it('is never negative', () => {
		expect(maxRequestableNcheq(-5n, 10n)).toBe(0n);
		expect(maxRequestableNcheq(10n, 0n)).toBe(0n);
	});
});

describe('buildFaucetQuotaSummary', () => {
	it('reports limit, used, remaining and the reset time', () => {
		const window = getFaucetQuotaWindow(new Date('2026-10-08T12:00:00Z'));
		const summary = buildFaucetQuotaSummary(35_000n * 1_000_000_000n, 100_000n * 1_000_000_000n, window);
		expect(summary).toEqual({
			period: 'month',
			limit: { cheq: 100000, ncheq: '100000000000000' },
			used: { cheq: 35000, ncheq: '35000000000000' },
			remaining: { cheq: 65000, ncheq: '65000000000000' },
			resetsAt: '2026-11-01T00:00:00.000Z',
		});
	});

	it('clamps remaining at zero when usage is above the limit', () => {
		const window = getFaucetQuotaWindow(new Date('2026-10-08T12:00:00Z'));
		expect(buildFaucetQuotaSummary(150n, 100n, window).remaining).toEqual({ cheq: 0, ncheq: '0' });
	});
});

describe('creditWithinQuota', () => {
	// creditWithinQuota logs through console by default; keep the test output clean
	beforeEach(() => {
		for (const level of ['info', 'warn', 'error'] as const) {
			jest.spyOn(console, level).mockImplementation(() => undefined);
		}
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	const customer = { customerId: 'c1' } as CustomerEntity;
	const window = getFaucetQuotaWindow(new Date('2026-10-08T12:00:00Z'));
	const params = { customer, address: 'cheqd1abc', amountNcheq: 10n, limitNcheq: 100n };
	const untouched = { released: [], completed: [], unknown: [] };

	const makeLedger = (reservation: FaucetReservation, options: { completeFails?: boolean } = {}) => {
		const ledgerCalls = { released: [] as string[], completed: [] as string[], unknown: [] as string[] };
		const ledger: FaucetQuotaLedger = {
			reserve: async () => reservation,
			release: async (id) => {
				ledgerCalls.released.push(id);
			},
			complete: async (id) => {
				if (options.completeFails) throw new Error('db down');
				ledgerCalls.completed.push(id);
			},
			markUnknown: async (id) => {
				ledgerCalls.unknown.push(id);
			},
		};
		return { ledger, ledgerCalls };
	};
	const reserved: FaucetReservation = { reserved: true, faucetRequestId: 'r1', usedNcheq: 40n, window };
	const ok = () => ({ status: 200, error: '' });

	it('does not call the faucet when the quota does not fit', async () => {
		const { ledger, ledgerCalls } = makeLedger({
			reserved: false,
			reason: 'quota_exceeded',
			usedNcheq: 95n,
			window,
		});
		let faucetCalls = 0;
		const result = await creditWithinQuota(ledger, async () => (faucetCalls++, ok()), params);
		expect(result).toEqual({ outcome: 'quota_exceeded', usedNcheq: 95n, window });
		expect(faucetCalls).toBe(0);
		expect(ledgerCalls).toEqual(untouched);
	});

	it('does not call the faucet and reports the wait when requests are too frequent', async () => {
		const { ledger, ledgerCalls } = makeLedger({
			reserved: false,
			reason: 'too_frequent',
			retryAfterSeconds: 7,
			window,
		});
		let faucetCalls = 0;
		const result = await creditWithinQuota(ledger, async () => (faucetCalls++, ok()), params);
		expect(result).toEqual({ outcome: 'too_frequent', retryAfterSeconds: 7, window });
		expect(faucetCalls).toBe(0);
		expect(ledgerCalls).toEqual(untouched);
	});

	it('does not call the faucet and reports the room left when the address cap would be exceeded', async () => {
		const { ledger, ledgerCalls } = makeLedger({
			reserved: false,
			reason: 'address_cap_exceeded',
			roomNcheq: 5n,
			window,
		});
		let faucetCalls = 0;
		const result = await creditWithinQuota(ledger, async () => (faucetCalls++, ok()), params);
		expect(result).toEqual({ outcome: 'address_cap_exceeded', roomNcheq: 5n });
		expect(faucetCalls).toBe(0);
		expect(ledgerCalls).toEqual(untouched);
	});

	it('marks the reservation completed and reports usage including this credit on success', async () => {
		const { ledger, ledgerCalls } = makeLedger(reserved);
		const result = await creditWithinQuota(ledger, async () => ok(), params);
		expect(result).toEqual({ outcome: 'credited', usedNcheq: 50n, window });
		expect(ledgerCalls).toEqual({ released: [], completed: ['r1'], unknown: [] });
	});

	it('still reports success if marking the reservation completed fails, because the tokens were sent', async () => {
		const { ledger, ledgerCalls } = makeLedger(reserved, { completeFails: true });
		const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const result = await creditWithinQuota(ledger, async () => ok(), params);
		errors.mockRestore();
		expect(result).toEqual({ outcome: 'credited', usedNcheq: 50n, window });
		expect(ledgerCalls).toEqual(untouched);
	});

	it('releases the reservation when the faucet answers with an error status', async () => {
		const { ledger, ledgerCalls } = makeLedger(reserved);
		const result = await creditWithinQuota(ledger, async () => ({ status: 500, error: 'boom' }), params);
		expect(result).toEqual({ outcome: 'faucet_failed', status: 500, error: 'boom' });
		expect(ledgerCalls).toEqual({ released: ['r1'], completed: [], unknown: [] });
	});

	it('marks the reservation unknown, never releasing it, when the faucet call throws', async () => {
		const { ledger, ledgerCalls } = makeLedger(reserved);
		await expect(
			creditWithinQuota(
				ledger,
				async () => {
					throw new Error('network timeout');
				},
				params
			)
		).rejects.toThrow('network timeout');
		expect(ledgerCalls).toEqual({ released: [], completed: [], unknown: ['r1'] });
	});

	describe('logging', () => {
		const capture = () => {
			const events: { level: string; event: string; fields: Record<string, unknown> }[] = [];
			const log: FaucetLogger = (level, event, fields) => events.push({ level, event, fields });
			return { events, log };
		};
		const names = (events: { event: string }[]) => events.map((e) => e.event);

		it('logs reserved then completed on success, with the customer, address and amount', async () => {
			const { ledger } = makeLedger(reserved);
			const { events, log } = capture();
			await creditWithinQuota(ledger, async () => ok(), params, log);
			expect(names(events)).toEqual(['faucet.reserved', 'faucet.completed']);
			expect(events[0]).toMatchObject({
				level: 'info',
				fields: {
					customerId: 'c1',
					address: 'cheqd1abc',
					amountNcheq: '10',
					reservationId: 'r1',
					usedNcheq: '40',
					limitNcheq: '100',
				},
			});
		});

		it('logs each rejection reason as a warning without reserving', async () => {
			const cases: [FaucetReservation, string, Record<string, unknown>][] = [
				[
					{ reserved: false, reason: 'quota_exceeded', usedNcheq: 95n, window },
					'faucet.quota_exceeded',
					{ usedNcheq: '95', limitNcheq: '100' },
				],
				[
					{ reserved: false, reason: 'too_frequent', retryAfterSeconds: 7, window },
					'faucet.too_frequent',
					{ retryAfterSeconds: 7 },
				],
				[
					{ reserved: false, reason: 'address_cap_exceeded', roomNcheq: 5n, window },
					'faucet.address_cap_exceeded',
					{ roomNcheq: '5' },
				],
			];
			for (const [reservation, event, fields] of cases) {
				const { ledger } = makeLedger(reservation);
				const { events, log } = capture();
				await creditWithinQuota(ledger, async () => ok(), params, log);
				expect(events).toHaveLength(1);
				expect(events[0]).toMatchObject({
					level: 'warn',
					event,
					fields: { customerId: 'c1', amountNcheq: '10', ...fields },
				});
			}
		});

		it('logs released with the faucet status when the faucet reports a failure', async () => {
			const { ledger } = makeLedger(reserved);
			const { events, log } = capture();
			await creditWithinQuota(ledger, async () => ({ status: 500, error: 'boom' }), params, log);
			expect(names(events)).toEqual(['faucet.reserved', 'faucet.released']);
			expect(events[1]).toMatchObject({
				level: 'warn',
				fields: { reservationId: 'r1', faucetStatus: 500, error: 'boom' },
			});
		});

		it('logs unknown, with the error, when the faucet call throws', async () => {
			const { ledger } = makeLedger(reserved);
			const { events, log } = capture();
			await expect(
				creditWithinQuota(
					ledger,
					async () => {
						throw new Error('network timeout');
					},
					params,
					log
				)
			).rejects.toThrow();
			expect(names(events)).toEqual(['faucet.reserved', 'faucet.unknown']);
			expect(events[1]).toMatchObject({
				level: 'warn',
				fields: { reservationId: 'r1', error: 'network timeout' },
			});
		});

		it('logs an error when marking the reservation completed fails', async () => {
			const { ledger } = makeLedger(reserved, { completeFails: true });
			const { events, log } = capture();
			await creditWithinQuota(ledger, async () => ok(), params, log);
			expect(names(events)).toEqual(['faucet.reserved', 'faucet.complete_failed']);
			expect(events[1].level).toBe('error');
		});

		it('writes a single JSON line per event by default', async () => {
			const { ledger } = makeLedger(reserved);
			const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
			await creditWithinQuota(ledger, async () => ok(), params);
			const lines = info.mock.calls.map((c) => JSON.parse(String(c[0])));
			info.mockRestore();
			expect(lines.map((l) => l.event)).toEqual(['faucet.reserved', 'faucet.completed']);
		});
	});
});
