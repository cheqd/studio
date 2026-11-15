import { describe, expect, it, jest } from '@jest/globals';
import { CheqdDataApiSource, DataApiHttpError } from '../../../src/services/ledger/cheqd-data-api-source.js';

type Reply = { status?: number; body: unknown };

/** A fake data-api: answers by endpoint and page, and records every URL asked for. */
function fakeApi(replies: (endpoint: string, page: number) => Reply) {
	const urls: URL[] = [];
	const fetcher = (async (input: URL | string) => {
		const url = new URL(String(input));
		urls.push(url);
		const endpoint = url.pathname.split('/').pop() as string;
		const reply = replies(endpoint, Number(url.searchParams.get('page')));
		return {
			ok: (reply.status ?? 200) < 400,
			status: reply.status ?? 200,
			json: async () => reply.body,
		};
	}) as unknown as typeof fetch;
	return { fetcher, urls };
}

const options = (fetcher: typeof fetch, overrides = {}) => ({
	baseUrl: 'https://data.example.test/',
	network: 'testnet' as const,
	pageSize: 2,
	maxPages: 2,
	timeoutMs: 1000,
	fetcher,
	...overrides,
});
const since = new Date('2026-03-04T10:00:00Z');

describe('CheqdDataApiSource', () => {
	it('returns an empty summary for an address with no writes', async () => {
		const { fetcher } = fakeApi(() => ({ body: { totalCount: 0, items: [] } }));
		const summary = await new CheqdDataApiSource(options(fetcher)).summarise('cheqd1test', since);
		expect(summary).toMatchObject({ writeCount: 0, firstWriteAt: null, lastWriteAt: null, capped: false });
	});

	it('sends the address as fee payer and a start date, and never an end date', async () => {
		const { fetcher, urls } = fakeApi(() => ({ body: { totalCount: 0, items: [] } }));
		await new CheqdDataApiSource(options(fetcher)).summarise('cheqd1test', since);
		expect(urls.map((u) => u.pathname)).toEqual(['/analytics/testnet/did', '/analytics/testnet/resource']);
		for (const url of urls) {
			expect(url.searchParams.get('feePayer')).toBe('cheqd1test');
			expect(url.searchParams.get('startDate')).toBe('2026-03-04');
			expect(url.searchParams.has('endDate')).toBe(false);
		}
	});

	it('counts kinds and takes first and last write times from the items', async () => {
		const { fetcher } = fakeApi((endpoint) =>
			endpoint === 'did'
				? {
						body: {
							totalCount: 1,
							items: [{ operationType: 'createDid', createdAt: '2026-03-05T09:00:00.000Z' }],
						},
					}
				: {
						body: {
							totalCount: 2,
							items: [
								{ resourceType: 'StatusList2021Revocation', createdAt: '2026-03-07T09:00:00.000Z' },
								{ resourceType: 'anonCredsSchema', createdAt: '2026-03-06T09:00:00.000Z' },
							],
						},
					}
		);
		const summary = await new CheqdDataApiSource(options(fetcher)).summarise('cheqd1test', since);
		expect(summary).toEqual({
			writeCount: 3,
			didWriteCount: 1,
			statusListWriteCount: 1,
			otherResourceWriteCount: 1,
			firstWriteAt: new Date('2026-03-05T09:00:00.000Z'),
			lastWriteAt: new Date('2026-03-07T09:00:00.000Z'),
			capped: false,
		});
	});

	it('reads at most maxPages, then the last page, and marks the address capped with exact totals', async () => {
		const asked: number[] = [];
		const { fetcher } = fakeApi((endpoint, page) => {
			if (endpoint === 'resource') return { body: { totalCount: 0, items: [] } };
			asked.push(page);
			return {
				body: {
					totalCount: 10,
					items: [
						{
							operationType: 'updateDid',
							createdAt: `2026-03-${String(10 - page).padStart(2, '0')}T00:00:00Z`,
						},
						{
							operationType: 'updateDid',
							createdAt: `2026-03-${String(10 - page).padStart(2, '0')}T01:00:00Z`,
						},
					],
				},
			};
		});
		const summary = await new CheqdDataApiSource(options(fetcher)).summarise('cheqd1test', since);
		expect(asked).toEqual([1, 2, 5]);
		expect(summary.capped).toBe(true);
		expect(summary.writeCount).toBe(10);
		expect(summary.firstWriteAt).toEqual(new Date('2026-03-05T00:00:00Z'));
		expect(summary.lastWriteAt).toEqual(new Date('2026-03-09T01:00:00Z'));
	});

	it('throws on a failed status or a changed shape, so a failure is never recorded as no writes', async () => {
		const failing = fakeApi(() => ({ status: 503, body: {} }));
		await expect(
			new CheqdDataApiSource(options(failing.fetcher)).summarise('cheqd1test', since)
		).rejects.toBeInstanceOf(DataApiHttpError);
		const odd = fakeApi(() => ({ body: { rows: [] } }));
		await expect(new CheqdDataApiSource(options(odd.fetcher)).summarise('cheqd1test', since)).rejects.toThrow(
			'unexpected shape'
		);
	});

	it('makes no request when constructed', () => {
		const fetcher = jest.fn() as unknown as typeof fetch;
		new CheqdDataApiSource(options(fetcher));
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('CheqdDataApiSource writes and extent', () => {
	const didItem = (operationType: string, createdAt: string, amount = 2.5) => ({
		operationType,
		createdAt,
		didId: 'did:cheqd:testnet:x',
		amount,
		denom: 'CHEQ',
		transactionHash: 'ABC',
	});

	it('lists writes with the fee in ncheq, queries the network it is asked for, and drops unknown operations', async () => {
		const { fetcher, urls } = fakeApi((endpoint) =>
			endpoint === 'did'
				? {
						body: {
							totalCount: 2,
							items: [
								didItem('updateDid', '2026-03-05T09:00:00.000Z', 2342.314809118),
								didItem('mystery', '2026-03-05T08:00:00.000Z'),
							],
						},
					}
				: {
						body: {
							totalCount: 1,
							items: [
								{
									resourceType: 'anonCredsStatusList',
									createdAt: '2026-03-05T10:00:00.000Z',
									didId: 'did:cheqd:testnet:x',
									amount: 1,
								},
							],
						},
					}
		);
		const list = await new CheqdDataApiSource(options(fetcher)).writes('cheqd1test', since, 'mainnet');
		expect(urls.every((u) => u.pathname.startsWith('/analytics/mainnet/'))).toBe(true);
		expect(list.total).toBe(3);
		expect(list.capped).toBe(false);
		expect(list.writes.map((w) => [w.operation, w.resourceType, w.feeNcheq])).toEqual([
			['updateDid', null, 2342314809118],
			['createResource', 'anonCredsStatusList', 1_000_000_000],
		]);
		expect(JSON.stringify(list)).not.toContain('ABC');
	});

	it('reads at most maxPages pages per endpoint and says so', async () => {
		const { fetcher, urls } = fakeApi((endpoint, page) => ({
			body: {
				totalCount: endpoint === 'did' ? 10 : 0,
				items: [didItem('createDid', `2026-03-0${page}T09:00:00.000Z`)],
			},
		}));
		const list = await new CheqdDataApiSource(options(fetcher)).writes('cheqd1test', since, 'testnet');
		expect(list.capped).toBe(true);
		expect(list.total).toBe(10);
		expect(urls.filter((u) => u.pathname.endsWith('/did'))).toHaveLength(2);
	});

	it('finds the first and last write with two requests per endpoint, and throws when the source fails', async () => {
		const { fetcher, urls } = fakeApi((endpoint, page) =>
			endpoint === 'did'
				? {
						body: {
							totalCount: 5,
							items: [
								didItem(
									'createDid',
									page === 1 ? '2026-11-01T00:00:00.000Z' : '2026-02-01T00:00:00.000Z'
								),
							],
						},
					}
				: { body: { totalCount: 0, items: [] } }
		);
		const extent = await new CheqdDataApiSource(options(fetcher)).extent('cheqd1test', 'testnet');
		expect(extent.firstWriteAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
		expect(extent.lastWriteAt?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
		expect(urls.filter((u) => u.searchParams.get('limit') === '1')).toHaveLength(3);
		const failing = fakeApi(() => ({ status: 503, body: {} }));
		await expect(new CheqdDataApiSource(options(failing.fetcher)).extent('cheqd1test', 'testnet')).rejects.toThrow(
			DataApiHttpError
		);
	});
});
