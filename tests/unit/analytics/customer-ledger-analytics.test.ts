import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import {
	CustomerLedgerAnalyticsService,
	FAILURE_TTL_MS,
	MAX_IDENTIFIER_ROWS,
	categoryOf,
	windowOf,
	type CustomerLedgerAnalytics,
} from '../../../src/services/analytics/customer-ledger-analytics.js';
import { CustomerAnalyticsController } from '../../../src/controllers/api/customer-analytics.js';
import { ledgerIndexerConfig, type LedgerIndexerConfig } from '../../../src/services/ledger/ledger-indexer.js';
import type {
	LedgerOperation,
	LedgerWrite,
	LedgerWriteReader,
} from '../../../src/services/ledger/ledger-activity-source.js';
import { beginShutdown, resetShutdownStateForTests } from '../../../src/helpers/shutdown-state.js';

const mine = '11111111-1111-4111-8111-111111111111';
const theirs = '22222222-2222-4222-8222-222222222222';
// 2026-11-15 12:00 UTC
const NOW = Date.parse('2026-11-15T12:00:00Z');

const config = (overrides: Partial<LedgerIndexerConfig> = {}): LedgerIndexerConfig => ({
	...ledgerIndexerConfig({}),
	enabled: true,
	...overrides,
});

const write = (
	operation: LedgerOperation,
	at: string,
	did: string | null,
	resourceType: string | null = null
): LedgerWrite => ({ operation, did, resourceType, at: new Date(at), feeNcheq: 123_000_000_000 });

interface Fixture {
	accounts?: Array<{ address: string; namespace: string }>;
	identifiers?: Record<string, Array<{ did: string; kind: string | null }>>;
	writes?: LedgerWrite[];
	extent?: { firstWriteAt: Date | null; lastWriteAt: Date | null };
	capped?: boolean;
	/** Studio's own latest DID or resource write for `mine`. */
	localLatest?: string;
}

function setup(fixture: Fixture = {}, ttlMs?: number, maxEntries?: number) {
	const queries: Array<{ sql: string; parameters: unknown[] }> = [];
	const reader = {
		writes: jest.fn(async (_address: string, _since: Date, _network: string) => ({
			writes: fixture.writes ?? [],
			total: (fixture.writes ?? []).length,
			capped: fixture.capped ?? false,
		})),
		extent: jest.fn(async () => fixture.extent ?? { firstWriteAt: null, lastWriteAt: null }),
	};
	let clock = NOW;
	const service = new CustomerLedgerAnalyticsService(
		() => ({
			query: async (sql: string, parameters: unknown[] = []) => {
				queries.push({ sql, parameters });
				const customer = parameters[0] as string;
				if (sql.includes('GREATEST')) {
					return [
						{ latest: customer === mine && fixture.localLatest ? new Date(fixture.localLatest) : null },
					];
				}
				if (sql.includes('"paymentAccount"')) {
					return customer === mine
						? (fixture.accounts ?? [{ address: 'cheqd1mine', namespace: 'testnet' }])
						: [];
				}
				const all = fixture.identifiers?.[customer] ?? [];
				const wanted = parameters[1] as string[];
				return all.filter((row) => wanted.includes(row.did));
			},
		}),
		() => config(),
		() => reader as unknown as LedgerWriteReader,
		() => clock,
		ttlMs,
		maxEntries
	);
	return {
		service,
		reader,
		queries,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

function supported(result: CustomerLedgerAnalytics) {
	if (!result.supported) throw new Error(`unsupported: ${result.reason}`);
	return result;
}

afterEach(() => resetShutdownStateForTests());

describe('windowOf', () => {
	it('is whole UTC days ending today', () => {
		expect(windowOf(7, NOW)).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
		expect(windowOf(30, NOW)).toMatchObject({ from: '2026-10-17', to: '2026-11-15' });
	});
});

describe('categoryOf', () => {
	it('keeps the ledger name and adds a coarse category', () => {
		expect(categoryOf('anonCredsStatusList')).toBe('status-list');
		expect(categoryOf('status-list-credential')).toBe('status-list');
		expect(categoryOf('anonCredsSchema')).toBe('schema');
		expect(categoryOf('anonCredsCredDef')).toBe('credential-definition');
		expect(categoryOf('AgentCard')).toBe('card');
		expect(categoryOf('accumulator')).toBe('other');
	});
});

describe('CustomerLedgerAnalyticsService', () => {
	it('is unsupported, and never calls the source, when the indexer settings are off', async () => {
		const { reader, queries } = setup();
		const off = new CustomerLedgerAnalyticsService(
			() => ({ query: async () => [] }),
			() => config({ enabled: false }),
			() => reader as unknown as LedgerWriteReader,
			() => NOW
		);
		const result = await off.ledger(mine, 30, 'all');
		expect(result).toMatchObject({ supported: false, range: 30, kind: 'all' });
		expect(reader.writes).not.toHaveBeenCalled();
		expect(queries).toHaveLength(0);
	});

	it('is unsupported during shutdown', async () => {
		const { service, reader } = setup();
		beginShutdown();
		expect((await service.ledger(mine, 30, 'all')).supported).toBe(false);
		expect(reader.writes).not.toHaveBeenCalled();
	});

	it('returns an explicit empty result, with zero-filled days, for a customer without a payer account', async () => {
		const { service, reader } = setup({ accounts: [] });
		const result = supported(await service.ledger(mine, 7, 'all'));
		expect(result.state).toBe('empty');
		expect(result.reason).toMatch(/no payer account/);
		expect(result.tiles).toEqual({
			writes: 0,
			activeIdentifiers: 0,
			statusListsPublished: 0,
			resourcesPublished: 0,
		});
		expect(result.series.days).toHaveLength(7);
		expect(result.firstWriteAt).toBeNull();
		expect(reader.writes).not.toHaveBeenCalled();
	});

	it('returns an empty result for a payer account with no writes ever', async () => {
		const { service, reader } = setup({});
		const result = supported(await service.ledger(mine, 30, 'all'));
		expect(result.state).toBe('empty');
		expect(result.series.days).toHaveLength(30);
		expect(reader.writes).toHaveBeenCalledWith('cheqd1mine', new Date('2026-10-17T00:00:00Z'), 'testnet');
	});

	it('says the index is behind, not empty, when Studio wrote for the account recently and the index shows nothing', async () => {
		// 40 minutes before NOW: identifiers and an agent created, nothing indexed yet
		const { service } = setup({ localLatest: '2026-11-15T11:20:00Z' });
		const result = supported(await service.ledger(mine, 30, 'all'));
		expect(result.state).toBe('delayed');
		expect(result.reason).toContain('not zero activity');
		expect(result.reason).toContain('2026-11-15T11:20:00.000Z');
		expect(result.tiles.writes).toBe(0);
	});

	it('asks the index again soon after a delayed answer instead of keeping it for minutes', async () => {
		const { service, reader, advance } = setup({ localLatest: '2026-11-15T11:20:00Z' });
		await service.ledger(mine, 30, 'all');
		advance(FAILURE_TTL_MS + 1);
		await service.ledger(mine, 30, 'all');
		expect(reader.writes).toHaveBeenCalledTimes(2);
	});

	it('stays empty when Studio’s own latest write is older than a day (not an index delay)', async () => {
		const { service } = setup({ localLatest: '2026-11-10T11:20:00Z' });
		expect(supported(await service.ledger(mine, 30, 'all')).state).toBe('empty');
	});

	it('notes that recent writes may be missing when Studio wrote after the newest indexed write', async () => {
		const { service } = setup({
			localLatest: '2026-11-15T11:50:00Z',
			writes: [write('createDid', '2026-11-15T09:00:00Z', 'did:cheqd:testnet:aaaa')],
			extent: { firstWriteAt: new Date('2026-11-15T09:00:00Z'), lastWriteAt: new Date('2026-11-15T09:00:00Z') },
		});
		const result = supported(await service.ledger(mine, 30, 'all'));
		expect(result.state).toBe('ok');
		expect(result.notes.some((note) => note.includes('has not caught up'))).toBe(true);
	});

	const did1 = 'did:cheqd:testnet:aaaa';
	const did2 = 'did:cheqd:testnet:bbbb';
	const gone = 'did:cheqd:testnet:gone';
	const full: Fixture = {
		identifiers: {
			[mine]: [
				{ did: did1, kind: null },
				{ did: did2, kind: 'agent' },
			],
		},
		writes: [
			write('createDid', '2026-11-15T10:00:00Z', did1),
			write('updateDid', '2026-11-14T10:00:00Z', did1),
			write('createResource', '2026-11-14T11:00:00Z', did1, 'anonCredsStatusList'),
			write('createResource', '2026-11-13T11:00:00Z', did1, 'anonCredsStatusList'),
			write('createResource', '2026-11-13T09:00:00Z', did2, 'AgentCard'),
			write('deactivateDid', '2026-11-12T09:00:00Z', gone),
			write('createDid', '2026-11-01T09:00:00Z', did1), // outside a 7 day window
		],
		extent: { firstWriteAt: new Date('2026-03-01T00:00:00Z'), lastWriteAt: new Date('2026-11-15T10:00:00Z') },
	};

	it('builds tiles, a zero-filled per-day series, and both tables for all identifiers', async () => {
		const { service } = setup(full);
		const result = supported(await service.ledger(mine, 7, 'all'));
		expect(result.state).toBe('ok');
		expect(result.tiles).toEqual({
			writes: 6,
			activeIdentifiers: 3,
			statusListsPublished: 2,
			resourcesPublished: 3,
		});
		expect(result.series.days.map((d) => d.date)).toEqual([
			'2026-11-09',
			'2026-11-10',
			'2026-11-11',
			'2026-11-12',
			'2026-11-13',
			'2026-11-14',
			'2026-11-15',
		]);
		expect(result.series.days[0]).toEqual({
			date: '2026-11-09',
			createDid: 0,
			updateDid: 0,
			deactivateDid: 0,
			createResource: 0,
		});
		expect(result.series.days[5]).toMatchObject({ updateDid: 1, createResource: 1 });
		expect(result.series.days[3]).toMatchObject({ deactivateDid: 1 });
		expect(result.byIdentifier).toEqual({
			rows: [
				{ did: did1, kind: 'organisation', lastWriteAt: '2026-11-15T10:00:00.000Z', writes: 4 },
				{ did: did2, kind: 'agent', lastWriteAt: '2026-11-13T09:00:00.000Z', writes: 1 },
			],
			total: 2,
			unmatchedWrites: 1,
		});
		expect(result.resourcesByType.rows).toEqual([
			{
				resourceType: 'anonCredsStatusList',
				category: 'status-list',
				count: 2,
				latestAt: '2026-11-14T11:00:00.000Z',
			},
			{ resourceType: 'AgentCard', category: 'card', count: 1, latestAt: '2026-11-13T09:00:00.000Z' },
		]);
		expect(result.firstWriteAt).toBe('2026-03-01T00:00:00.000Z');
		expect(result.lastWriteAt).toBe('2026-11-15T10:00:00.000Z');
		expect(result.networks).toEqual(['testnet']);
	});

	it('filters by kind: agent and organisation exclude identifiers Studio no longer holds', async () => {
		const agent = supported(await setup(full).service.ledger(mine, 7, 'agent'));
		expect(agent.tiles).toMatchObject({ writes: 1, activeIdentifiers: 1, resourcesPublished: 1 });
		expect(agent.byIdentifier.rows.map((r) => r.did)).toEqual([did2]);
		expect(agent.byIdentifier.unmatchedWrites).toBe(0);
		const organisation = supported(await setup(full).service.ledger(mine, 7, 'organisation'));
		expect(organisation.tiles.writes).toBe(4);
		expect(organisation.byIdentifier.rows.map((r) => r.did)).toEqual([did1]);
	});

	it("never shows another customer's identifiers or uses another customer's id", async () => {
		const other: Fixture = {
			...full,
			identifiers: { [mine]: [{ did: did1, kind: null }], [theirs]: [{ did: did2, kind: 'agent' }] },
		};
		const { service, queries } = setup(other);
		const result = supported(await service.ledger(mine, 7, 'all'));
		expect(result.byIdentifier.rows.map((r) => r.did)).toEqual([did1]);
		expect(JSON.stringify(result)).not.toContain(theirs);
		for (const query of queries) {
			expect(query.parameters[0]).toBe(mine);
			expect(query.sql).toMatch(/"customerId" = \$1::uuid/);
		}
		// a customer with no payer account sees nothing, whatever the fake source holds
		expect(supported(await setup(other).service.ledger(theirs, 7, 'all')).state).toBe('empty');
	});

	it('returns no fee, CHEQ, address or hash fields anywhere', async () => {
		const result = supported(await setup(full).service.ledger(mine, 30, 'all'));
		const keys: string[] = [];
		const walk = (value: unknown) => {
			if (Array.isArray(value)) value.forEach(walk);
			else if (value && typeof value === 'object') {
				for (const [key, inner] of Object.entries(value)) {
					keys.push(key);
					walk(inner);
				}
			}
		};
		walk(result);
		expect(keys.filter((k) => /fee|cheq|amount|address|hash|payer|denom/i.test(k))).toEqual([]);
		expect(JSON.stringify(result)).not.toMatch(/cheqd1|123000000000/);
	});

	it('caps the identifier table at 50 rows, newest write first', async () => {
		const many = Array.from({ length: 60 }, (_, i) => `did:cheqd:testnet:${String(i).padStart(4, '0')}`);
		const { service } = setup({
			identifiers: { [mine]: many.map((did) => ({ did, kind: null })) },
			writes: many.map((did, i) =>
				write('createDid', new Date(Date.parse('2026-11-15T00:00:00Z') + i * 60_000).toISOString(), did)
			),
		});
		const result = supported(await service.ledger(mine, 7, 'all'));
		expect(result.byIdentifier.rows).toHaveLength(MAX_IDENTIFIER_ROWS);
		expect(result.byIdentifier.total).toBe(60);
		expect(result.byIdentifier.rows[0]!.did).toBe(many[59]);
	});

	it('flags truncation when the source says more writes exist', async () => {
		const result = supported(await setup({ ...full, capped: true }).service.ledger(mine, 7, 'all'));
		expect(result.truncated).toBe(true);
		expect(result.notes.join(' ')).toMatch(/lower bound/);
	});

	it('answers supported:false, never zeros, when the source fails', async () => {
		const { service, reader } = setup(full);
		reader.writes.mockRejectedValueOnce(new Error('HTTP 503 https://secret.example'));
		const result = await service.ledger(mine, 7, 'all');
		expect(result).toMatchObject({ supported: false, range: 7, kind: 'all' });
		expect(JSON.stringify(result)).not.toMatch(/503|secret/);
		expect(result).not.toHaveProperty('tiles');
	});

	it('answers supported:false when one of several payer accounts fails', async () => {
		const { service, reader } = setup({
			...full,
			accounts: [
				{ address: 'cheqd1a', namespace: 'testnet' },
				{ address: 'cheqd1b', namespace: 'mainnet' },
			],
		});
		reader.extent.mockRejectedValueOnce(new Error('down'));
		expect((await service.ledger(mine, 7, 'all')).supported).toBe(false);
	});

	it('caches a customer for the ttl, per range and kind, then asks again', async () => {
		const { service, reader, advance } = setup(full, 5 * 60_000);
		await service.ledger(mine, 7, 'all');
		await service.ledger(mine, 7, 'all');
		expect(reader.writes).toHaveBeenCalledTimes(1);
		await service.ledger(mine, 30, 'all');
		await service.ledger(mine, 7, 'agent');
		expect(reader.writes).toHaveBeenCalledTimes(3);
		advance(5 * 60_000 + 1);
		await service.ledger(mine, 7, 'all');
		expect(reader.writes).toHaveBeenCalledTimes(4);
	});

	it('shares one lookup between concurrent identical calls', async () => {
		const { service, reader } = setup(full);
		await Promise.all([
			service.ledger(mine, 7, 'all'),
			service.ledger(mine, 7, 'all'),
			service.ledger(mine, 7, 'all'),
		]);
		expect(reader.writes).toHaveBeenCalledTimes(1);
	});

	it('remembers a failure only briefly', async () => {
		const { service, reader, advance } = setup(full);
		reader.writes.mockRejectedValueOnce(new Error('down'));
		expect((await service.ledger(mine, 7, 'all')).supported).toBe(false);
		expect((await service.ledger(mine, 7, 'all')).supported).toBe(false);
		expect(reader.writes).toHaveBeenCalledTimes(1);
		advance(FAILURE_TTL_MS + 1);
		expect((await service.ledger(mine, 7, 'all')).supported).toBe(true);
		expect(reader.writes).toHaveBeenCalledTimes(2);
	});

	it('bounds the cache size, evicting the oldest entry', async () => {
		const { service, reader } = setup(full, undefined, 2);
		await service.ledger(mine, 7, 'all');
		await service.ledger(mine, 30, 'all');
		await service.ledger(mine, 7, 'agent'); // evicts 7|all
		expect(reader.writes).toHaveBeenCalledTimes(3);
		await service.ledger(mine, 7, 'all');
		expect(reader.writes).toHaveBeenCalledTimes(4);
	});
});

describe('CustomerAnalyticsController.ledger', () => {
	const fake = () => ({ ledger: jest.fn(async () => ({ supported: true })) });

	async function call(
		service: ReturnType<typeof fake>,
		query: Record<string, unknown>,
		customerId: string | null = mine
	) {
		const controller = new CustomerAnalyticsController(
			undefined,
			() => service as unknown as CustomerLedgerAnalyticsService
		);
		const request = { method: 'GET', query, params: {}, body: {} } as unknown as Request;
		for (const validator of CustomerAnalyticsController.ledgerValidator) await validator.run(request);
		const response = {
			locals: customerId === null ? {} : { customer: { customerId } },
			statusCode: 0,
			body: undefined as unknown,
			status(code: number) {
				this.statusCode = code;
				return this;
			},
			json(body: unknown) {
				this.body = body;
				return this;
			},
		};
		await controller.ledger(request, response as unknown as Response);
		return { status: response.statusCode, body: response.body };
	}

	it('defaults to 30 days and all, and uses the signed-in customer only', async () => {
		const service = fake();
		expect((await call(service, { customerId: theirs })).status).toBe(200);
		expect(service.ledger).toHaveBeenLastCalledWith(mine, 30, 'all');
		await call(service, { range: '7', kind: 'agent' });
		expect(service.ledger).toHaveBeenLastCalledWith(mine, 7, 'agent');
	});

	it.each([
		[{ range: '14' }],
		[{ range: '90' }],
		[{ kind: 'everything' }],
		[{ range: ['7', '30'] }],
		[{ range: ['7', '7'] }],
		[{ kind: ['all', 'agent'] }],
		[{ kind: ['agent'] }],
		[{ range: { a: '7' } }],
	])('answers 400, not 500, for %j and does not query', async (query) => {
		const service = fake();
		const result = await call(service, query);
		expect(result.status).toBe(400);
		expect(service.ledger).not.toHaveBeenCalled();
	});

	it('answers 401 with no customer and 500 with a generic error when the service throws', async () => {
		const service = fake();
		expect((await call(service, {}, null)).status).toBe(401);
		service.ledger.mockRejectedValueOnce(new Error('db down'));
		expect((await call(service, {})).status).toBe(500);
	});
});
