import { describe, expect, it } from '@jest/globals';
import { AdminAnalyticsService, type Queryable } from '../../../src/services/admin/admin-analytics.js';

const studioRow = {
	funded: '10',
	own: '6',
	firstWrite7d: '4',
	wroteAgain: '2',
	toppedUp: '3',
	did: '3',
	lists: '1',
	other: '2',
};
const ledgerRow = {
	funded: '10',
	checked: '10',
	firstWrite7d: '5',
	wroteAgain: '3',
	stillOff: '4',
	did: '5',
	lists: '2',
	other: '1',
	withinHour: '1',
	withinDay: '2',
	withinWeek: '1',
	withinMonth: '1',
	wroteJourney: '2',
	wroteNoJourney: '4',
	noWriteJourney: '1',
	noWriteNoJourney: '3',
};

function service(enabled: boolean, ledger: Record<string, string>, minCoveragePercent = 90) {
	const calls: string[] = [];
	const db: Queryable = {
		query: async (sql: string) => {
			calls.push(sql);
			return [sql.includes('"ledgerAddressActivity"') ? ledger : studioRow];
		},
	};
	return {
		svc: new AdminAnalyticsService(
			() => db,
			() => ({ enabled, minCoveragePercent })
		),
		calls,
	};
}

describe('faucetToLedger with the ledger indexer', () => {
	it('is unchanged and runs no ledger query when the indexer is disabled', async () => {
		const { svc, calls } = service(false, ledgerRow);
		const result = await svc.faucetToLedger(30, 'all');
		expect(calls).toHaveLength(1);
		for (const key of ['wroteToLedgerWithin7Days', 'stillOffLedger']) {
			expect(result.tiles[key]).toEqual({ supported: false, reason: expect.any(String) });
		}
		expect(result.ledgerFunnel.supported).toBe(false);
		expect(result.ledgerVsStudioJourneys.supported).toBe(false);
		expect(result.unavailable).toContain('ledgerFunnel');
		expect(result.ledgerIndexer).toEqual({
			enabled: false,
			fundedAddresses: 0,
			checkedAddresses: 0,
			supported: false,
		});
	});

	it('returns ledger values for what it can now measure, and keeps savedToProfile unsupported', async () => {
		const { svc } = service(true, ledgerRow);
		const result = await svc.faucetToLedger(30, 'all');
		expect(result.tiles.wroteToLedgerWithin7Days).toEqual({ supported: true, value: 5 });
		expect(result.tiles.stillOffLedger).toEqual({ supported: true, value: 4 });
		expect(result.tiles.savedToProfile.supported).toBe(false);
		expect(result.funnel).toEqual({
			supported: true,
			rows: [
				{ key: 'funded', label: expect.any(String), addresses: 10, basis: 'all-funded' },
				{
					key: 'first-ledger-write-7d',
					label: 'First ledger write (within 7 days)',
					addresses: 5,
					basis: 'all-funded',
				},
				{
					key: 'wrote-again-ledger',
					label: 'Wrote again (2 or more writes)',
					addresses: 3,
					basis: 'all-funded',
				},
				{ key: 'topped-up', label: expect.any(String), addresses: 3, basis: 'all-funded' },
			],
		});
		expect((result.writeKinds as { rows: Array<{ addresses: number }> }).rows.map((r) => r.addresses)).toEqual([
			5, 2, 1,
		]);
		expect(
			(result.timeToFirstWrite as { rows: Array<{ addresses: number }> }).rows.map((r) => r.addresses)
		).toEqual([1, 2, 1, 1]);
		expect(result.ledgerVsStudioJourneys).toEqual({
			supported: true,
			rows: [
				{ key: 'wrote', label: 'Wrote to the ledger', usedStudioJourney: 2, noStudioJourney: 4 },
				{ key: 'no-writes', label: 'No ledger writes', usedStudioJourney: 1, noStudioJourney: 3 },
			],
		});
		expect(result.unavailable).toEqual(['tiles.savedToProfile']);
		expect(result.ledgerIndexer).toEqual({
			enabled: true,
			fundedAddresses: 10,
			checkedAddresses: 10,
			supported: true,
		});
		expect(JSON.stringify(result)).not.toMatch(/cheqd1/);
	});

	it('stays unsupported, with counts in the reason, while too few addresses have been checked', async () => {
		const { svc } = service(true, { ...ledgerRow, checked: '3' });
		const result = await svc.faucetToLedger(30, 'all');
		expect(result.tiles.wroteToLedgerWithin7Days).toEqual({
			supported: false,
			reason: expect.stringContaining('3 of 10'),
		});
		expect(result.ledgerFunnel.supported).toBe(false);
		expect(result.funnel).toMatchObject({
			supported: true,
			rows: expect.arrayContaining([expect.objectContaining({ key: 'first-studio-write-7d' })]),
		});
	});

	it('stays unsupported when nothing has been checked', async () => {
		const { svc } = service(true, { ...ledgerRow, checked: '0' });
		const result = await svc.faucetToLedger(30, 'all');
		expect(result.tiles.stillOffLedger.supported).toBe(false);
	});
});
