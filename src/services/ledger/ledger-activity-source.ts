/**
 * Where the ledger indexer gets its facts. The sync only knows this interface, so a different source (a node's
 * `tx_search`, a self-hosted indexer) can replace the default without touching the sync, and tests use a fake.
 */
export interface LedgerWriteSummary {
	/** Successful DID and resource writes signed (fee-paid) by the address since `since`. */
	writeCount: number;
	didWriteCount: number;
	/** Resource writes whose type is a status list or a revocation registry. */
	statusListWriteCount: number;
	otherResourceWriteCount: number;
	firstWriteAt: Date | null;
	lastWriteAt: Date | null;
	/** More writes exist than one check reads: `writeCount`, `firstWriteAt` and `lastWriteAt` are exact, the per-kind counts cover the writes read and are a lower bound. */
	capped: boolean;
	/** Per-day buckets of the writes read. Absent when the source cannot supply them. */
	daily?: DailyBucket[];
	/** First UTC day (`YYYY-MM-DD`) from which `daily` is complete; null when it is complete from `since`. */
	dailyCompleteFrom?: string | null;
}

export type LedgerNetwork = 'testnet' | 'mainnet';
export type LedgerOperation = 'createDid' | 'updateDid' | 'deactivateDid' | 'createResource';

/** One successful write as the source reports it. No address and no transaction hash is kept. */
export interface LedgerWrite {
	operation: LedgerOperation;
	did: string | null;
	/** The resource type as the ledger reports it; null for DID writes. */
	resourceType: string | null;
	at: Date;
	/** The fee paid, in ncheq (integer), or null when the source did not report one. */
	feeNcheq: number | null;
}

export interface LedgerWriteList {
	writes: LedgerWrite[];
	/** Writes that exist in the window (exact) across both endpoints. */
	total: number;
	/** More writes exist than the page bound reads: `writes` holds the newest ones, so counts are a lower bound. */
	capped: boolean;
}

export interface LedgerExtent {
	firstWriteAt: Date | null;
	lastWriteAt: Date | null;
}

/** What the customer analytics need from the source: the writes of one fee payer, and its first and last write. */
export interface LedgerWriteReader {
	/** Throws on any failure, so the caller never reports a failed lookup as "no writes". */
	writes(address: string, since: Date, network: LedgerNetwork): Promise<LedgerWriteList>;
	extent(address: string, network: LedgerNetwork): Promise<LedgerExtent>;
}

/** Writes of one address on one UTC day, by operation and resource type ('' for DID writes). */
export interface DailyBucket {
	day: string;
	operation: LedgerOperation;
	resourceType: string;
	count: number;
	feeNcheq: number;
}

export interface LedgerActivitySource {
	/** Throws on any failure, so the caller never records a failed lookup as "no writes". */
	summarise(address: string, since: Date): Promise<LedgerWriteSummary>;
}

export const EMPTY_SUMMARY: LedgerWriteSummary = {
	writeCount: 0,
	didWriteCount: 0,
	statusListWriteCount: 0,
	otherResourceWriteCount: 0,
	firstWriteAt: null,
	lastWriteAt: null,
	capped: false,
	daily: [],
	dailyCompleteFrom: null,
};
