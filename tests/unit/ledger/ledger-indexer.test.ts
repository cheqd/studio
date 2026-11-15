import { describe, expect, it, jest } from '@jest/globals';
import {
	LedgerIndexer,
	ledgerIndexerConfig,
	type LedgerIndexerConfig,
	type Queryable,
} from '../../../src/services/ledger/ledger-indexer.js';
import { EMPTY_SUMMARY, type LedgerActivitySource } from '../../../src/services/ledger/ledger-activity-source.js';

const config = (overrides: Partial<LedgerIndexerConfig> = {}): LedgerIndexerConfig => ({
	...ledgerIndexerConfig({}),
	enabled: true,
	maxRetries: 2,
	...overrides,
});

function fakeDb(due: Array<{ address: string; firstFunded: string }>) {
	const writes: unknown[][] = [];
	const selects: unknown[][] = [];
	const db: Queryable = {
		query: async (sql: string, parameters: unknown[] = []) => {
			if (sql.includes('INSERT INTO "ledgerAddressActivity"')) {
				writes.push(parameters);
				return [];
			}
			selects.push(parameters);
			return due;
		},
	};
	return { db, writes, selects };
}

const funded = (address: string) => ({ address, firstFunded: '2026-03-04T10:00:00.000Z' });
const noSleep = async () => undefined;

describe('ledgerIndexerConfig', () => {
	it('is off by default and has safe bounded defaults', () => {
		const c = ledgerIndexerConfig({});
		expect(c.enabled).toBe(false);
		expect(c.batchSize).toBe(25);
		expect(c.sourceUrl).toBe('https://data-api.cheqd.io');
		expect(ledgerIndexerConfig({ LEDGER_INDEXER_BATCH_SIZE: '9999' }).batchSize).toBe(200);
		expect(ledgerIndexerConfig({ LEDGER_INDEXER_ENABLED: 'true' }).enabled).toBe(true);
		expect(ledgerIndexerConfig({ LEDGER_INDEXER_ENABLED: 'yes' }).enabled).toBe(false);
	});
});

describe('LedgerIndexer.runOnce', () => {
	it('asks the database for a bounded batch and upserts one summary per address', async () => {
		const { db, writes, selects } = fakeDb([funded('cheqd1a'), funded('cheqd1b')]);
		const source: LedgerActivitySource = {
			summarise: async (address) =>
				address === 'cheqd1a'
					? {
							...EMPTY_SUMMARY,
							writeCount: 3,
							didWriteCount: 2,
							statusListWriteCount: 1,
							firstWriteAt: new Date('2026-03-05T00:00:00Z'),
							lastWriteAt: new Date('2026-03-09T00:00:00Z'),
							daily: [
								{
									day: '2026-03-05',
									operation: 'createDid',
									resourceType: '',
									count: 2,
									feeNcheq: 5_000_000_000,
								},
							],
							dailyCompleteFrom: '2026-03-02',
						}
					: { ...EMPTY_SUMMARY },
		};
		const indexer = new LedgerIndexer(
			() => db,
			() => config({ batchSize: 7 }),
			() => source,
			noSleep
		);
		expect(await indexer.runOnce()).toEqual({ checked: 2, failed: 0, aborted: false });
		expect(selects[0]).toEqual([7, 24]);
		expect(writes).toHaveLength(2);
		expect(writes[0]).toEqual([
			'cheqd1a',
			new Date('2026-03-05T00:00:00Z'),
			new Date('2026-03-09T00:00:00Z'),
			3,
			2,
			1,
			0,
			false,
			JSON.stringify([
				{ day: '2026-03-05', operationType: 'createDid', resourceType: '', count: 2, feeNcheq: 5_000_000_000 },
			]),
			'2026-03-02',
		]);
		expect(writes[1]).toEqual(['cheqd1b', null, null, 0, 0, 0, 0, false, '[]', null]);
	});

	it('retries with exponential backoff and then succeeds', async () => {
		const { db, writes } = fakeDb([funded('cheqd1a')]);
		const summarise = jest
			.fn<LedgerActivitySource['summarise']>()
			.mockRejectedValueOnce(new Error('503'))
			.mockRejectedValueOnce(new Error('503'))
			.mockResolvedValueOnce({ ...EMPTY_SUMMARY });
		const sleeps: number[] = [];
		const indexer = new LedgerIndexer(
			() => db,
			() => config(),
			() => ({ summarise }),
			async (ms) => void sleeps.push(ms)
		);
		expect(await indexer.runOnce()).toMatchObject({ checked: 1, failed: 0 });
		expect(sleeps).toEqual([500, 1000]);
		expect(writes).toHaveLength(1);
	});

	it('records nothing for an address whose lookup keeps failing, and stops after repeated failures', async () => {
		const { db, writes } = fakeDb([funded('cheqd1a'), funded('cheqd1b'), funded('cheqd1c'), funded('cheqd1d')]);
		const summarise = jest.fn<LedgerActivitySource['summarise']>().mockRejectedValue(new Error('down'));
		const indexer = new LedgerIndexer(
			() => db,
			() => config({ maxRetries: 1 }),
			() => ({ summarise }),
			noSleep
		);
		expect(await indexer.runOnce()).toEqual({ checked: 0, failed: 3, aborted: true });
		expect(writes).toHaveLength(0);
		expect(summarise).toHaveBeenCalledTimes(6);
	});

	it('is idempotent: running again over the same state sends the same upserts', async () => {
		const { db, writes } = fakeDb([funded('cheqd1a')]);
		const source: LedgerActivitySource = {
			summarise: async () => ({ ...EMPTY_SUMMARY, writeCount: 1, didWriteCount: 1 }),
		};
		const indexer = new LedgerIndexer(
			() => db,
			() => config(),
			() => source,
			noSleep
		);
		await indexer.runOnce();
		await indexer.runOnce();
		expect(writes[0]).toEqual(writes[1]);
	});
});

describe('LedgerIndexer per-day storage', () => {
	it('replaces the per-day rows and the summary in one statement, and re-checks addresses without per-day rows', async () => {
		const statements: string[] = [];
		const db: Queryable = {
			query: async (sql: string) => {
				statements.push(sql);
				return sql.includes('FROM "faucetRequest"') ? [funded('cheqd1a')] : [];
			},
		};
		const source: LedgerActivitySource = { summarise: async () => ({ ...EMPTY_SUMMARY }) };
		await new LedgerIndexer(
			() => db,
			() => config(),
			() => source,
			noSleep
		).runOnce();
		const select = statements.find((sql) => sql.includes('FROM "faucetRequest"')) as string;
		expect(select).toMatch(/"dailySyncedAt" IS NULL/);
		const writes = statements.filter((sql) => sql.includes('INSERT INTO "ledgerAddressActivity"'));
		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatch(/DELETE FROM "ledgerAddressDaily"/);
		expect(writes[0]).toMatch(/INSERT INTO "ledgerAddressDaily"/);
	});

	it('does not mark per-day rows as stored when the source gives none', async () => {
		const { db, writes } = fakeDb([funded('cheqd1a')]);
		const { daily: _daily, dailyCompleteFrom: _from, ...bare } = EMPTY_SUMMARY;
		await new LedgerIndexer(
			() => db,
			() => config(),
			() => ({ summarise: async () => bare }),
			noSleep
		).runOnce();
		expect(writes[0]!.slice(8)).toEqual([null, null]);
	});
});

describe('LedgerIndexer.maybeRun', () => {
	it('does nothing, and builds no source, when disabled', () => {
		const makeSource = jest.fn();
		const db = jest.fn();
		const indexer = new LedgerIndexer(db as never, () => config({ enabled: false }), makeSource as never, noSleep);
		indexer.maybeRun();
		expect(makeSource).not.toHaveBeenCalled();
		expect(db).not.toHaveBeenCalled();
	});

	it('starts at most one run per interval', async () => {
		const { db, selects } = fakeDb([]);
		let clock = 1_000_000_000;
		const indexer = new LedgerIndexer(
			() => db,
			() => config({ runIntervalMinutes: 10 }),
			() => ({ summarise: async () => ({ ...EMPTY_SUMMARY }) }),
			noSleep,
			() => clock
		);
		indexer.maybeRun();
		indexer.maybeRun();
		await new Promise((resolve) => setImmediate(resolve));
		expect(selects).toHaveLength(1);
		clock += 11 * 60_000;
		indexer.maybeRun();
		await new Promise((resolve) => setImmediate(resolve));
		expect(selects).toHaveLength(2);
	});

	it('starts no new run once shutdown has begun', async () => {
		const { beginShutdown, resetShutdownStateForTests } = await import('../../../src/helpers/shutdown-state.js');
		const makeSource = jest.fn();
		const indexer = new LedgerIndexer(
			() => ({ query: jest.fn() }) as never,
			() => config(),
			makeSource as never,
			noSleep
		);
		beginShutdown();
		try {
			indexer.maybeRun();
			await new Promise((resolve) => setImmediate(resolve));
			expect(makeSource).not.toHaveBeenCalled();
		} finally {
			resetShutdownStateForTests();
		}
	});

	it('swallows a database failure', async () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const db: Queryable = { query: async () => Promise.reject(new Error('boom')) };
		const indexer = new LedgerIndexer(
			() => db,
			() => config(),
			() => ({ summarise: async () => ({ ...EMPTY_SUMMARY }) }),
			noSleep,
			() => 5e12
		);
		expect(() => indexer.maybeRun()).not.toThrow();
		await new Promise((resolve) => setImmediate(resolve));
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
