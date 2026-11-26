import { Connection } from '../../database/connection/connection.js';
import { isShuttingDown } from '../../helpers/shutdown-state.js';
import { CheqdDataApiSource } from '../ledger/cheqd-data-api-source.js';
import type {
	LedgerNetwork,
	LedgerOperation,
	LedgerWrite,
	LedgerWriteReader,
} from '../ledger/ledger-activity-source.js';
import { ledgerIndexerConfig, type LedgerIndexerConfig, type Queryable } from '../ledger/ledger-indexer.js';

/**
 * On-ledger activity for ONE customer: the DID and resource writes paid from the customer's own Studio payer
 * account(s), read from the cheqd data API by fee payer. Counts only: no fee or CHEQ figure (an owner decision for
 * customers), no transaction hash, no address, no credential content; the only identifiers returned are DIDs that
 * Studio holds for this customer. The customer id comes from the session, never a parameter, and every database
 * statement filters on it. Anything the source cannot answer is `{ supported: false, reason }`, never a zero.
 */
export const LEDGER_RANGES = [7, 30] as const;
export type LedgerRange = (typeof LEDGER_RANGES)[number];
export const LEDGER_KINDS = ['all', 'organisation', 'agent'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const MAX_IDENTIFIER_ROWS = 50;
export const MAX_RESOURCE_TYPE_ROWS = 50;
const MAX_PAYER_ACCOUNTS = 4;
export const CACHE_TTL_MS = 5 * 60_000;
/** A failed lookup is remembered briefly so a failing source is not asked again on every page view. */
export const FAILURE_TTL_MS = 30_000;
export const MAX_CACHE_ENTRIES = 200;
const OVERALL_BUDGET_MS = 25_000;
/**
 * How recent Studio's own record of a write must be for an empty index answer to count as "not indexed yet" rather
 * than "no writes". The cheqd data API indexes the ledger after the fact and can run behind it.
 */
export const INDEX_DELAY_WINDOW_MS = 24 * 60 * 60_000;
/** Studio's newest write this much later than the index's newest one means the index is behind. */
const INDEX_BEHIND_TOLERANCE_MS = 5 * 60_000;

export interface DayPoint {
	date: string;
	createDid: number;
	updateDid: number;
	deactivateDid: number;
	createResource: number;
}

export type ResourceCategory = 'status-list' | 'schema' | 'credential-definition' | 'card' | 'other';

interface Window {
	range: LedgerRange;
	kind: LedgerKind;
	from: string;
	to: string;
}

export type CustomerLedgerAnalytics =
	| ({ supported: false; reason: string } & Window)
	| ({
			supported: true;
			/** `delayed`: Studio made writes recently that the ledger index does not show yet (not zero activity). */
			state: 'ok' | 'empty' | 'delayed';
			reason?: string;
			networks: LedgerNetwork[];
			tiles: {
				writes: number;
				activeIdentifiers: number;
				statusListsPublished: number;
				resourcesPublished: number;
			};
			series: { days: DayPoint[] };
			byIdentifier: {
				rows: Array<{ did: string; kind: 'organisation' | 'agent'; lastWriteAt: string; writes: number }>;
				total: number;
				unmatchedWrites: number;
			};
			resourcesByType: {
				rows: Array<{ resourceType: string; category: ResourceCategory; count: number; latestAt: string }>;
			};
			firstWriteAt: string | null;
			lastWriteAt: string | null;
			truncated: boolean;
			generatedAt: string;
			notes: string[];
	  } & Window);

const DAY_MS = 86_400_000;
const day = (date: Date) => date.toISOString().slice(0, 10);
const STATUS_LIST = /status.?list/i;

export function categoryOf(resourceType: string): ResourceCategory {
	if (STATUS_LIST.test(resourceType)) return 'status-list';
	if (/schema/i.test(resourceType)) return 'schema';
	if (/cred.?def/i.test(resourceType)) return 'credential-definition';
	if (/card/i.test(resourceType)) return 'card';
	return 'other';
}

/** The first and last UTC day of a window of `range` whole days that ends today. */
export function windowOf(range: LedgerRange, nowMs: number): { start: Date; from: string; to: string } {
	const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
	const start = new Date(today - (range - 1) * DAY_MS);
	return { start, from: day(start), to: day(new Date(today)) };
}

interface CacheEntry {
	expires: number;
	value: Promise<CustomerLedgerAnalytics>;
}

export class CustomerLedgerAnalyticsService {
	public static instance = new CustomerLedgerAnalyticsService();

	private readonly cache = new Map<string, CacheEntry>();

	constructor(
		private readonly db: () => Queryable = () => Connection.instance.dbConnection,
		private readonly config: () => LedgerIndexerConfig = () => ledgerIndexerConfig(),
		private readonly makeReader: (config: LedgerIndexerConfig) => LedgerWriteReader = (config) =>
			new CheqdDataApiSource({
				baseUrl: config.sourceUrl,
				network: 'testnet',
				pageSize: config.pageSize,
				maxPages: config.maxPages,
				timeoutMs: config.timeoutSeconds * 1000,
			}),
		private readonly now: () => number = () => Date.now(),
		private readonly ttlMs: number = CACHE_TTL_MS,
		private readonly maxEntries: number = MAX_CACHE_ENTRIES
	) {}

	/** Cached for a few minutes per customer, range and kind; concurrent identical calls share one lookup. */
	public async ledger(customerId: string, range: LedgerRange, kind: LedgerKind): Promise<CustomerLedgerAnalytics> {
		const config = this.config();
		const win = windowOf(range, this.now());
		const base: Window = { range, kind, from: win.from, to: win.to };
		if (!config.enabled) {
			return {
				supported: false,
				reason: 'On-ledger analytics are not switched on in this environment.',
				...base,
			};
		}
		if (isShuttingDown()) {
			return { supported: false, reason: 'Studio is restarting; try again in a moment.', ...base };
		}
		const key = `${customerId}|${range}|${kind}`;
		const hit = this.cache.get(key);
		const nowMs = this.now();
		if (hit && hit.expires > nowMs) return hit.value;
		const value = this.compute(customerId, base, win.start, config).catch(
			(): CustomerLedgerAnalytics => ({
				supported: false,
				reason: 'On-ledger activity could not be read right now. This is not zero activity; try again shortly.',
				...base,
			})
		);
		this.remember(key, value);
		const result = await value;
		if (!result.supported || result.state === 'delayed') {
			// Shorten the memory of a failure, or of an index that has not caught up, so recovery shows quickly
			const entry = this.cache.get(key);
			if (entry && entry.value === value) entry.expires = nowMs + FAILURE_TTL_MS;
		}
		return result;
	}

	public clearCache(): void {
		this.cache.clear();
	}

	private remember(key: string, value: Promise<CustomerLedgerAnalytics>): void {
		this.cache.delete(key);
		this.cache.set(key, { expires: this.now() + this.ttlMs, value });
		while (this.cache.size > this.maxEntries) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}
	}

	private async compute(
		customerId: string,
		base: Window,
		start: Date,
		config: LedgerIndexerConfig
	): Promise<CustomerLedgerAnalytics> {
		const accounts = (await this.db().query(
			`SELECT "address", "namespace" FROM "paymentAccount" WHERE "customerId" = $1::uuid ORDER BY "createdAt" LIMIT ${MAX_PAYER_ACCOUNTS}`,
			[customerId]
		)) as Array<{ address: string; namespace: string }>;
		const usable = accounts.filter((a) => a.namespace === 'testnet' || a.namespace === 'mainnet');
		if (usable.length === 0) {
			return this.build(base, {
				networks: [],
				writes: [],
				first: null,
				last: null,
				truncated: false,
				identifiers: new Map(),
				empty: true,
				reason: 'This account has no payer account yet, so it has no ledger writes.',
			});
		}
		const reader = this.makeReader(config);
		const lookups = Promise.all(
			usable.map(async (account) => {
				const network = account.namespace as LedgerNetwork;
				const [list, extent] = await Promise.all([
					reader.writes(account.address, start, network),
					reader.extent(account.address, network),
				]);
				return { network, list, extent };
			})
		);
		let timer: NodeJS.Timeout | undefined;
		const budget = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error('budget')), OVERALL_BUDGET_MS);
		});
		let results;
		try {
			results = await Promise.race([lookups, budget]);
		} finally {
			clearTimeout(timer);
			lookups.catch(() => undefined);
		}
		const writes = results.flatMap((r) => r.list.writes);
		const firsts = results.map((r) => r.extent.firstWriteAt).filter((d): d is Date => d !== null);
		const lasts = results.map((r) => r.extent.lastWriteAt).filter((d): d is Date => d !== null);
		const first = firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null;
		const last = lasts.length ? new Date(Math.max(...lasts.map((d) => d.getTime()))) : null;
		const identifiers = new Map<string, 'organisation' | 'agent'>();
		const dids = [...new Set(writes.map((w) => w.did).filter((d): d is string => d !== null))];
		if (dids.length > 0) {
			const rows = (await this.db().query(
				`SELECT "did", "kind" FROM "identifier" WHERE "customerId" = $1::uuid AND "did" = ANY($2::text[])`,
				[customerId, dids]
			)) as Array<{ did: string; kind: string | null }>;
			for (const row of rows) identifiers.set(row.did, row.kind === 'agent' ? 'agent' : 'organisation');
		}
		const networks = usable.map((a) => a.namespace as LedgerNetwork);
		const empty = first === null && writes.length === 0;
		// Studio's own record of its latest write for this customer, to tell "not indexed yet" from "none"
		const local = await this.latestLocalWrite(customerId);
		const nowMs = this.now();
		const delayed = empty && local !== null && nowMs - local.getTime() < INDEX_DELAY_WINDOW_MS;
		const behind =
			!empty && local !== null && (last === null || local.getTime() - last.getTime() > INDEX_BEHIND_TOLERANCE_MS);
		return this.build(base, {
			networks,
			writes,
			first,
			last,
			truncated: results.some((r) => r.list.capped),
			identifiers,
			empty,
			delayed,
			indexBehind: behind ? local : null,
			reason: delayed
				? `Studio made ledger writes for this account (the latest at ${local?.toISOString()}) that the ledger index does not show yet. The index (cheqd data API) can run behind the ledger; this is not zero activity. Check again later.`
				: empty
					? 'No ledger writes from your payer account yet.'
					: undefined,
		});
	}

	/** When Studio last recorded a DID or resource it wrote for this customer, or null. Never fails the answer. */
	private async latestLocalWrite(customerId: string): Promise<Date | null> {
		try {
			const rows = (await this.db().query(
				`SELECT GREATEST(
					(SELECT MAX("saveDate") FROM "identifier" WHERE "customerId" = $1::uuid AND "did" LIKE 'did:cheqd:%'),
					(SELECT MAX("createdAt") FROM "resource" WHERE "customerId" = $1::uuid)
				) AS "latest"`,
				[customerId]
			)) as Array<{ latest: Date | string | null }>;
			const latest = rows[0]?.latest;
			if (!latest) return null;
			const date = latest instanceof Date ? latest : new Date(latest);
			return Number.isNaN(date.getTime()) ? null : date;
		} catch {
			return null;
		}
	}

	private build(
		base: Window,
		data: {
			networks: LedgerNetwork[];
			writes: LedgerWrite[];
			first: Date | null;
			last: Date | null;
			truncated: boolean;
			identifiers: Map<string, 'organisation' | 'agent'>;
			empty: boolean;
			delayed?: boolean;
			/** Studio's latest write, when it is newer than anything the index shows. */
			indexBehind?: Date | null;
			reason?: string;
		}
	): CustomerLedgerAnalytics {
		const { networks, first, last, truncated, identifiers, empty, delayed, indexBehind, reason } = data;
		const allWrites = data.writes;
		const writes = allWrites.filter((w) => {
			if (base.kind === 'all') return true;
			const kind = w.did ? identifiers.get(w.did) : undefined;
			return kind === base.kind;
		});
		const days = new Map<string, DayPoint>();
		const startMs = Date.parse(`${base.from}T00:00:00Z`);
		const span = Math.round((Date.parse(`${base.to}T00:00:00Z`) - startMs) / DAY_MS) + 1;
		for (let i = 0; i < span; i++) {
			const date = day(new Date(startMs + i * DAY_MS));
			days.set(date, { date, createDid: 0, updateDid: 0, deactivateDid: 0, createResource: 0 });
		}
		const inRange: LedgerWrite[] = [];
		for (const write of writes) {
			const point = days.get(day(write.at));
			if (!point) continue;
			point[write.operation as LedgerOperation]++;
			inRange.push(write);
		}
		const perDid = new Map<string, { writes: number; last: Date }>();
		const perType = new Map<string, { count: number; latest: Date }>();
		let unmatched = 0;
		const active = new Set<string>();
		for (const write of inRange) {
			if (write.did) {
				active.add(write.did);
				const kind = identifiers.get(write.did);
				if (kind) {
					const entry = perDid.get(write.did) ?? { writes: 0, last: write.at };
					entry.writes++;
					if (write.at > entry.last) entry.last = write.at;
					perDid.set(write.did, entry);
				} else {
					unmatched++;
				}
			} else {
				unmatched++;
			}
			if (write.operation === 'createResource' && write.resourceType) {
				const entry = perType.get(write.resourceType) ?? { count: 0, latest: write.at };
				entry.count++;
				if (write.at > entry.latest) entry.latest = write.at;
				perType.set(write.resourceType, entry);
			}
		}
		const resourceWrites = inRange.filter((w) => w.operation === 'createResource');
		const rows = [...perDid.entries()]
			.map(([did, v]) => ({
				did,
				kind: identifiers.get(did) as 'organisation' | 'agent',
				lastWriteAt: v.last.toISOString(),
				writes: v.writes,
			}))
			.sort((a, b) =>
				a.lastWriteAt < b.lastWriteAt ? 1 : a.lastWriteAt > b.lastWriteAt ? -1 : a.did.localeCompare(b.did)
			);
		const notes = [
			'Counts only, for writes paid from your own Studio payer account. Writes made from other addresses are not included.',
			'Key rotations are counted as DID updates.',
		];
		if (base.kind !== 'all') notes.push('Identifiers Studio no longer holds are only counted under kind=all.');
		if (truncated)
			notes.push('More writes exist in this range than are read at once; the counts are a lower bound.');
		if (indexBehind)
			notes.push(
				`The ledger index has not caught up: Studio wrote for this account at ${indexBehind.toISOString()}, after the newest write the index shows. Recent writes may not be counted yet.`
			);
		return {
			supported: true,
			state: delayed ? 'delayed' : empty ? 'empty' : 'ok',
			...(reason ? { reason } : {}),
			...base,
			networks,
			tiles: {
				writes: inRange.length,
				activeIdentifiers: active.size,
				statusListsPublished: resourceWrites.filter((w) => STATUS_LIST.test(w.resourceType ?? '')).length,
				resourcesPublished: resourceWrites.length,
			},
			series: { days: [...days.values()] },
			byIdentifier: { rows: rows.slice(0, MAX_IDENTIFIER_ROWS), total: rows.length, unmatchedWrites: unmatched },
			resourcesByType: {
				rows: [...perType.entries()]
					.map(([resourceType, v]) => ({
						resourceType,
						category: categoryOf(resourceType),
						count: v.count,
						latestAt: v.latest.toISOString(),
					}))
					.sort((a, b) => b.count - a.count || a.resourceType.localeCompare(b.resourceType))
					.slice(0, MAX_RESOURCE_TYPE_ROWS),
			},
			firstWriteAt: first ? first.toISOString() : null,
			lastWriteAt: last ? last.toISOString() : null,
			truncated,
			generatedAt: new Date(this.now()).toISOString(),
			notes,
		};
	}
}
