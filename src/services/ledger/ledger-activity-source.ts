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
};
