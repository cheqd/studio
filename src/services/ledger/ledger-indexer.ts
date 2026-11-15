import { Connection } from '../../database/connection/connection.js';
import { isShuttingDown } from '../../helpers/shutdown-state.js';
import { parseNonNegativeIntEnv, parseNumberEnv } from '../../types/constants.js';
import { CheqdDataApiSource } from './cheqd-data-api-source.js';
import type { LedgerActivitySource } from './ledger-activity-source.js';

export interface Queryable {
	query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/** Read lazily, never at import, so nothing about the indexer runs or is validated until it is asked for. */
export interface LedgerIndexerConfig {
	enabled: boolean;
	sourceUrl: string;
	batchSize: number;
	recheckHours: number;
	runIntervalMinutes: number;
	maxPages: number;
	pageSize: number;
	timeoutSeconds: number;
	maxRetries: number;
	minCoveragePercent: number;
}

export const ledgerIndexerConfig = (env: Record<string, string | undefined> = process.env): LedgerIndexerConfig => ({
	enabled: env.LEDGER_INDEXER_ENABLED === 'true',
	sourceUrl: env.LEDGER_INDEXER_SOURCE_URL?.trim() || 'https://data-api.cheqd.io',
	batchSize: Math.min(200, parseNumberEnv(env.LEDGER_INDEXER_BATCH_SIZE, 25, 'LEDGER_INDEXER_BATCH_SIZE')),
	recheckHours: parseNumberEnv(env.LEDGER_INDEXER_RECHECK_HOURS, 24, 'LEDGER_INDEXER_RECHECK_HOURS'),
	runIntervalMinutes: parseNonNegativeIntEnv(
		env.LEDGER_INDEXER_RUN_INTERVAL_MINUTES,
		10,
		'LEDGER_INDEXER_RUN_INTERVAL_MINUTES'
	),
	maxPages: Math.min(50, parseNumberEnv(env.LEDGER_INDEXER_MAX_PAGES, 10, 'LEDGER_INDEXER_MAX_PAGES')),
	pageSize: Math.min(100, parseNumberEnv(env.LEDGER_INDEXER_PAGE_SIZE, 100, 'LEDGER_INDEXER_PAGE_SIZE')),
	timeoutSeconds: parseNumberEnv(env.LEDGER_INDEXER_TIMEOUT_SECONDS, 15, 'LEDGER_INDEXER_TIMEOUT_SECONDS'),
	maxRetries: parseNonNegativeIntEnv(env.LEDGER_INDEXER_MAX_RETRIES, 3, 'LEDGER_INDEXER_MAX_RETRIES'),
	minCoveragePercent: Math.min(
		100,
		parseNumberEnv(env.LEDGER_INDEXER_MIN_COVERAGE_PERCENT, 90, 'LEDGER_INDEXER_MIN_COVERAGE_PERCENT')
	),
});

export interface SyncResult {
	checked: number;
	failed: number;
	/** The run stopped early because the source kept failing. */
	aborted: boolean;
}

const BACKOFF_BASE_MS = 500;
/** Stop a run after this many addresses in a row fail even after retries: the source is down, so stop asking. */
const MAX_CONSECUTIVE_FAILURES = 3;

export class LedgerIndexer {
	public static instance = new LedgerIndexer();

	private running = false;
	private lastStartedAt = 0;

	constructor(
		private readonly db: () => Queryable = () => Connection.instance.dbConnection,
		private readonly config: () => LedgerIndexerConfig = () => ledgerIndexerConfig(),
		private readonly makeSource: (config: LedgerIndexerConfig) => LedgerActivitySource = (config) =>
			new CheqdDataApiSource({
				baseUrl: config.sourceUrl,
				network: 'testnet',
				pageSize: config.pageSize,
				maxPages: config.maxPages,
				timeoutMs: config.timeoutSeconds * 1000,
			}),
		private readonly sleep: (ms: number) => Promise<void> = (ms) =>
			new Promise((resolve) => setTimeout(resolve, ms)),
		private readonly now: () => number = () => Date.now()
	) {}

	public isEnabled(): boolean {
		return this.config().enabled;
	}

	/**
	 * One bounded batch: the addresses never checked, then the ones checked longest ago, up to `batchSize`. Every
	 * address is replaced whole (upsert), so repeating a run, or two runs overlapping, writes the same answer. A
	 * failed lookup leaves the row untouched, so it is retried next run and is never recorded as "no writes".
	 * Resumable because progress is the table itself: there is no cursor to lose.
	 */
	public async runOnce(): Promise<SyncResult> {
		const config = this.config();
		const source = this.makeSource(config);
		const db = this.db();
		const due = (await db.query(
			`SELECT f.address, f.first_funded AS "firstFunded"
			FROM (SELECT "address", MIN("createdAt") AS first_funded FROM "faucetRequest" WHERE "status" = 'completed' GROUP BY "address") f
			LEFT JOIN "ledgerAddressActivity" a ON a."address" = f.address
			WHERE a."address" IS NULL OR a."checkedAt" < now() - ($2::numeric * interval '1 hour')
			ORDER BY a."checkedAt" ASC NULLS FIRST, f.first_funded ASC
			LIMIT $1`,
			[config.batchSize, config.recheckHours]
		)) as Array<{ address: string; firstFunded: Date | string }>;

		const result: SyncResult = { checked: 0, failed: 0, aborted: false };
		let consecutive = 0;
		for (const row of due) {
			let summary;
			for (let attempt = 0; ; attempt++) {
				try {
					summary = await source.summarise(row.address, new Date(row.firstFunded));
					break;
				} catch {
					if (attempt >= config.maxRetries) break;
					await this.sleep(BACKOFF_BASE_MS * 2 ** attempt);
				}
			}
			if (!summary) {
				result.failed++;
				if (++consecutive >= MAX_CONSECUTIVE_FAILURES) {
					result.aborted = true;
					break;
				}
				continue;
			}
			consecutive = 0;
			await db.query(
				`INSERT INTO "ledgerAddressActivity"
					("address", "firstWriteAt", "lastWriteAt", "writeCount", "didWriteCount", "statusListWriteCount", "otherResourceWriteCount", "capped", "checkedAt")
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
				ON CONFLICT ("address") DO UPDATE SET
					"firstWriteAt" = EXCLUDED."firstWriteAt", "lastWriteAt" = EXCLUDED."lastWriteAt",
					"writeCount" = EXCLUDED."writeCount", "didWriteCount" = EXCLUDED."didWriteCount",
					"statusListWriteCount" = EXCLUDED."statusListWriteCount",
					"otherResourceWriteCount" = EXCLUDED."otherResourceWriteCount",
					"capped" = EXCLUDED."capped", "checkedAt" = now()`,
				[
					row.address,
					summary.firstWriteAt,
					summary.lastWriteAt,
					summary.writeCount,
					summary.didWriteCount,
					summary.statusListWriteCount,
					summary.otherResourceWriteCount,
					summary.capped,
				]
			);
			result.checked++;
		}
		return result;
	}

	/**
	 * Starts a batch in the background when the indexer is enabled, none is running in this process and the last one
	 * started at least `runIntervalMinutes` ago. Studio has no scheduler, so this is called from requests that already
	 * happen (a faucet request, a staff look at the analytics). It never delays or fails the caller and never throws.
	 */
	public maybeRun(): void {
		if (isShuttingDown()) return;
		const config = this.config();
		if (!config.enabled || this.running) return;
		const now = this.now();
		if (now - this.lastStartedAt < config.runIntervalMinutes * 60_000) return;
		this.lastStartedAt = now;
		this.running = true;
		this.runOnce()
			.then((result) => {
				if (result.checked > 0 || result.failed > 0) {
					console.info(JSON.stringify({ event: 'ledger-indexer.run', ...result }));
				}
			})
			.catch((error) =>
				console.error(
					JSON.stringify({ event: 'ledger-indexer.failed', error: (error as Error)?.message ?? 'unknown' })
				)
			)
			.finally(() => {
				this.running = false;
			});
	}
}
