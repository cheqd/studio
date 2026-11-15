import {
	EMPTY_SUMMARY,
	type LedgerActivitySource,
	type LedgerExtent,
	type LedgerNetwork,
	type LedgerOperation,
	type LedgerWrite,
	type LedgerWriteList,
	type LedgerWriteReader,
	type LedgerWriteSummary,
} from './ledger-activity-source.js';

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
	didId?: unknown;
	/** The transaction fee in CHEQ (checked against the node: it equals the `fee` on the transaction). */
	amount?: unknown;
	denom?: unknown;
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

const DID_OPERATIONS: ReadonlySet<string> = new Set(['createDid', 'updateDid', 'deactivateDid']);
/** The data API reports the fee in CHEQ with up to nine decimals: 1 CHEQ is 10^9 ncheq. */
const NCHEQ_PER_CHEQ = 1e9;
/** Far enough back to include every write: the API's default window is the last 30 days. */
const EPOCH_START = new Date('2020-01-01T00:00:00Z');

/** Turns one API item into a write, or null when it is not one of the four operations this reports. */
export function toWrite(endpoint: 'did' | 'resource', item: Item): LedgerWrite | null {
	const at = typeof item.createdAt === 'string' ? new Date(item.createdAt) : null;
	if (!at || Number.isNaN(at.getTime())) return null;
	let operation: LedgerOperation;
	if (endpoint === 'did') {
		if (typeof item.operationType !== 'string' || !DID_OPERATIONS.has(item.operationType)) return null;
		operation = item.operationType as LedgerOperation;
	} else {
		operation = 'createResource';
	}
	const feeNcheq =
		typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount >= 0
			? Math.round(item.amount * NCHEQ_PER_CHEQ)
			: null;
	return {
		operation,
		did: typeof item.didId === 'string' ? item.didId : null,
		resourceType: endpoint === 'resource' && typeof item.resourceType === 'string' ? item.resourceType : null,
		at,
		feeNcheq,
	};
}

export class CheqdDataApiSource implements LedgerActivitySource, LedgerWriteReader {
	private readonly fetcher: typeof fetch;

	constructor(private readonly options: DataApiOptions) {
		this.fetcher = options.fetcher ?? fetch;
	}

	private async page(
		endpoint: 'did' | 'resource',
		address: string,
		since: Date,
		page: number,
		network: LedgerNetwork = this.options.network,
		limit: number = this.options.pageSize
	): Promise<Page> {
		const url = new URL(`${this.options.baseUrl.replace(/\/+$/, '')}/analytics/${network}/${endpoint}`);
		url.searchParams.set('feePayer', address);
		url.searchParams.set('startDate', since.toISOString().slice(0, 10));
		url.searchParams.set('page', String(page));
		url.searchParams.set('limit', String(limit));
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
		since: Date,
		network: LedgerNetwork = this.options.network
	): Promise<{ total: number; items: Item[]; capped: boolean }> {
		const first = await this.page(endpoint, address, since, 1, network);
		const items = [...first.items];
		const pages = Math.ceil(first.totalCount / this.options.pageSize);
		const readable = Math.min(pages, this.options.maxPages);
		for (let n = 2; n <= readable; n++)
			items.push(...(await this.page(endpoint, address, since, n, network)).items);
		const capped = pages > readable;
		// The newest pages were read; fetch the very last page too so the first write time stays exact
		if (capped) items.push(...(await this.page(endpoint, address, since, pages, network)).items);
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

	/**
	 * The fee payer's successful writes since `since`, newest first, at most `maxPages` pages per endpoint. `total` is
	 * exact; `capped` says the newest `maxPages` pages were read and older writes in the window were not.
	 */
	async writes(address: string, since: Date, network: LedgerNetwork): Promise<LedgerWriteList> {
		const read = async (endpoint: 'did' | 'resource') => {
			const first = await this.page(endpoint, address, since, 1, network);
			const items = [...first.items];
			const pages = Math.ceil(first.totalCount / this.options.pageSize);
			const readable = Math.min(pages, this.options.maxPages);
			for (let n = 2; n <= readable; n++) {
				items.push(...(await this.page(endpoint, address, since, n, network)).items);
			}
			const writes = items
				.map((item) => toWrite(endpoint, item))
				.filter((write): write is LedgerWrite => write !== null);
			return { total: first.totalCount, writes, capped: pages > readable };
		};
		const dids = await read('did');
		const resources = await read('resource');
		return {
			writes: [...dids.writes, ...resources.writes],
			total: dids.total + resources.total,
			capped: dids.capped || resources.capped,
		};
	}

	/** First and last write of the fee payer over its whole history: at most two requests per endpoint. */
	async extent(address: string, network: LedgerNetwork): Promise<LedgerExtent> {
		const times: Date[] = [];
		for (const endpoint of ['did', 'resource'] as const) {
			const newest = await this.page(endpoint, address, EPOCH_START, 1, network, 1);
			if (newest.totalCount === 0) continue;
			const oldest =
				newest.totalCount > 1
					? await this.page(endpoint, address, EPOCH_START, newest.totalCount, network, 1)
					: newest;
			for (const item of [newest.items[0], oldest.items[0]]) {
				const write = item ? toWrite(endpoint, item) : null;
				if (write) times.push(write.at);
			}
		}
		if (times.length === 0) return { firstWriteAt: null, lastWriteAt: null };
		const ms = times.map((t) => t.getTime());
		return { firstWriteAt: new Date(Math.min(...ms)), lastWriteAt: new Date(Math.max(...ms)) };
	}
}
