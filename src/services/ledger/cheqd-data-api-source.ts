import { EMPTY_SUMMARY, type LedgerActivitySource, type LedgerWriteSummary } from './ledger-activity-source.js';

/**
 * The cheqd data-api (github.com/cheqd/data-api), which indexes DID and resource transactions for both networks.
 * `GET {base}/analytics/{network}/did|resource?feePayer=&startDate=&page=&limit=`.
 *
 * Facts learned from the live service that this relies on:
 * - `startDate` must always be sent: the default window is the last 30 days.
 * - `endDate` is deliberately not sent: an explicit end date is exclusive, so it would drop today's writes.
 * - Failed transactions are excluded by default (`success=true`), which is what is wanted here.
 * - Items come newest first, but the code takes the minimum and maximum `createdAt` anyway.
 */
export interface DataApiOptions {
	baseUrl: string;
	network: 'testnet' | 'mainnet';
	pageSize: number;
	/** Most pages read per address and endpoint; beyond that the address is marked `capped`. */
	maxPages: number;
	timeoutMs: number;
	fetcher?: typeof fetch;
}

interface Item {
	operationType?: unknown;
	resourceType?: unknown;
	createdAt?: unknown;
}
interface Page {
	totalCount: number;
	items: Item[];
}

const STATUS_LIST_TYPE = /status.?list|revoc/i;

export class DataApiHttpError extends Error {
	constructor(readonly status: number) {
		super(`ledger data source answered HTTP ${status}`);
	}
}

export class CheqdDataApiSource implements LedgerActivitySource {
	private readonly fetcher: typeof fetch;

	constructor(private readonly options: DataApiOptions) {
		this.fetcher = options.fetcher ?? fetch;
	}

	private async page(endpoint: 'did' | 'resource', address: string, since: Date, page: number): Promise<Page> {
		const url = new URL(
			`${this.options.baseUrl.replace(/\/+$/, '')}/analytics/${this.options.network}/${endpoint}`
		);
		url.searchParams.set('feePayer', address);
		url.searchParams.set('startDate', since.toISOString().slice(0, 10));
		url.searchParams.set('page', String(page));
		url.searchParams.set('limit', String(this.options.pageSize));
		const response = await this.fetcher(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(this.options.timeoutMs),
		});
		if (!response.ok) throw new DataApiHttpError(response.status);
		const body = (await response.json()) as { totalCount?: unknown; items?: unknown };
		if (typeof body.totalCount !== 'number' || !Array.isArray(body.items)) {
			throw new Error('ledger data source answered an unexpected shape');
		}
		return { totalCount: body.totalCount, items: body.items as Item[] };
	}

	/** Every item the cap allows, plus the oldest page when the cap cut the list short. */
	private async read(
		endpoint: 'did' | 'resource',
		address: string,
		since: Date
	): Promise<{ total: number; items: Item[]; capped: boolean }> {
		const first = await this.page(endpoint, address, since, 1);
		const items = [...first.items];
		const pages = Math.ceil(first.totalCount / this.options.pageSize);
		const readable = Math.min(pages, this.options.maxPages);
		for (let n = 2; n <= readable; n++) items.push(...(await this.page(endpoint, address, since, n)).items);
		const capped = pages > readable;
		// The newest pages were read; fetch the very last page too so the first write time stays exact
		if (capped) items.push(...(await this.page(endpoint, address, since, pages)).items);
		return { total: first.totalCount, items, capped };
	}

	async summarise(address: string, since: Date): Promise<LedgerWriteSummary> {
		const [dids, resources] = await Promise.all([
			this.read('did', address, since),
			this.read('resource', address, since),
		]);
		const writeCount = dids.total + resources.total;
		if (writeCount === 0) return { ...EMPTY_SUMMARY };
		const times = [...dids.items, ...resources.items]
			.map((item) => (typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : NaN))
			.filter((t) => Number.isFinite(t));
		const statusLists = resources.items.filter((i) => STATUS_LIST_TYPE.test(String(i.resourceType ?? ''))).length;
		const capped = dids.capped || resources.capped;
		return {
			writeCount,
			didWriteCount: dids.items.length,
			statusListWriteCount: statusLists,
			otherResourceWriteCount: resources.items.length - statusLists,
			firstWriteAt: times.length ? new Date(Math.min(...times)) : null,
			lastWriteAt: times.length ? new Date(Math.max(...times)) : null,
			capped,
		};
	}
}
