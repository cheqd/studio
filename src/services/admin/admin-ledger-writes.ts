import { Connection } from '../../database/connection/connection.js';
import type { Unsupported } from '../analytics/customer-analytics.js';
import { ledgerIndexerConfig, type Queryable } from '../ledger/ledger-indexer.js';
import { RANGES, type Range } from './admin-analytics.js';

/**
 * Staff on-ledger writes: what the faucet-funded addresses wrote to the cheqd ledger, by type and day, how many kept
 * writing, the fees they paid and how much went through Studio. Counts and fees only, read from the per-day table the
 * ledger indexer fills (`ledgerAddressDaily`): no address, DID or transaction is returned. Addresses are testnet.
 *
 * Only addresses whose per-day history is stored and complete for the whole range count ("covered"). When too few
 * funded addresses are covered, or the indexer is off, every section is `{ supported: false, reason }`, never zeros.
 * Fees are exact: the data API reports each transaction's fee (`amount`, in CHEQ), which equals the fee on the
 * transaction; no estimate is made. Failed transactions are not in the source, so fees burnt on them are not counted.
 */
export const WRITE_OPERATIONS = ['createDid', 'updateDid', 'deactivateDid', 'createResource'] as const;
export type WriteOperation = (typeof WRITE_OPERATIONS)[number];
export const RETENTION_WEEKS = [1, 2, 4] as const;

export interface Fee {
	writes: number;
	/** Exact integer ncheq as a string. */
	ncheq: string;
	/** `ncheq` / 10^9. */
	cheq: number;
}

type Section<T> = ({ supported: true } & T) | Unsupported;

export interface LedgerWritesResponse {
	range: Range;
	from: string;
	to: string;
	network: 'testnet';
	coverage: { fundedAddresses: number; coveredAddresses: number; percent: number; minimumPercent: number };
	writes: Section<{
		days: Array<Record<WriteOperation, number> & { date: string; total: number }>;
		totals: Record<WriteOperation, number> & { total: number };
	}>;
	retention: Section<{
		definition: string;
		cohort: number;
		weeks: Array<{ week: number; eligible: number; retained: number; share: number | null }>;
	}>;
	fees: Section<{
		basis: string;
		denom: 'CHEQ';
		byOperation: Array<{
			operationType: WriteOperation;
			studioPayerAccounts: Fee;
			otherAddresses: Fee;
			total: Fee;
		}>;
		totals: { studioPayerAccounts: Fee; otherAddresses: Fee; total: Fee };
	}>;
	channels: Section<{
		studioWrites: number;
		otherWrites: number;
		studioShare: number | null;
		writingAddresses: { studio: number; other: number };
	}>;
	notes: string[];
}

const DAY_MS = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const num = (value: unknown): number => Number(value ?? 0);

export const RETENTION_DEFINITION =
	'Cohort: funded addresses whose first ever write falls on a UTC day D0 inside the range. Week k (1, 2 or 4) is the ' +
	'7-day bucket D0+7k to D0+7k+6. Retained at week k means at least one write on a day in that bucket. Only addresses ' +
	'whose bucket has fully ended before today (UTC) and lies inside their stored history are eligible. ' +
	'share = retained / eligible.';

const FEE_BASIS = 'exact: the fee recorded on each transaction, as reported by the cheqd data API';

const feeOf = (writes: number, ncheq: bigint): Fee => ({
	writes,
	ncheq: ncheq.toString(),
	cheq: Number(ncheq) / 1e9,
});

/** Funded addresses with per-day rows stored and complete from the start of the range. */
const COVERED_CTE = `covered AS (
	SELECT a."address" FROM "ledgerAddressActivity" a
	WHERE a."dailySyncedAt" IS NOT NULL AND (a."dailyCompleteFrom" IS NULL OR a."dailyCompleteFrom" <= $1::date)
		AND EXISTS (SELECT 1 FROM "faucetRequest" f WHERE f."address" = a."address" AND f."status" = 'completed')
)`;

export class AdminLedgerWritesService {
	public static instance = new AdminLedgerWritesService();

	constructor(
		private readonly db: () => Queryable = () => Connection.instance.dbConnection,
		private readonly config: () => { enabled: boolean; minCoveragePercent: number } = () => ledgerIndexerConfig(),
		private readonly now: () => number = () => Date.now()
	) {}

	private async rows<T = Record<string, unknown>>(sql: string, parameters: unknown[]): Promise<T[]> {
		return (await this.db().query(sql, parameters)) as T[];
	}

	async ledgerWrites(range: Range): Promise<LedgerWritesResponse> {
		if (!RANGES.includes(range)) throw new Error(`range must be one of ${RANGES.join(', ')}`);
		const config = this.config();
		const today = Math.floor(this.now() / DAY_MS) * DAY_MS;
		const from = day(today - (range - 1) * DAY_MS);
		const to = day(today);
		const base = { range, from, to, network: 'testnet' as const };
		const unsupported = (reason: string): Unsupported => ({ supported: false, reason });
		const everything = (reason: string, coverage: LedgerWritesResponse['coverage']): LedgerWritesResponse => ({
			...base,
			coverage,
			writes: unsupported(reason),
			retention: unsupported(reason),
			fees: unsupported(reason),
			channels: unsupported(reason),
			notes: [],
		});
		const emptyCoverage = {
			fundedAddresses: 0,
			coveredAddresses: 0,
			percent: 0,
			minimumPercent: config.minCoveragePercent,
		};
		if (!config.enabled) {
			return everything(
				'The ledger indexer is not switched on (LEDGER_INDEXER_ENABLED), so Studio holds no per-day ledger writes.',
				emptyCoverage
			);
		}

		const [coverageRow] = await this.rows(
			`WITH ${COVERED_CTE}
			SELECT (SELECT COUNT(DISTINCT "address") FROM "faucetRequest" WHERE "status" = 'completed') AS funded,
				(SELECT COUNT(*) FROM covered) AS covered`,
			[from]
		);
		const funded = num(coverageRow?.funded);
		const covered = num(coverageRow?.covered);
		const percent = funded === 0 ? 0 : Math.round((covered / funded) * 1000) / 10;
		const coverage = {
			fundedAddresses: funded,
			coveredAddresses: covered,
			percent,
			minimumPercent: config.minCoveragePercent,
		};
		if (funded === 0) return everything('No address has been funded from the faucet yet.', coverage);
		if (covered === 0 || percent < config.minCoveragePercent) {
			return everything(
				`The ledger indexer has stored per-day writes for ${covered} of ${funded} funded addresses (${percent}%), below the ${config.minCoveragePercent}% needed to report. It fills in on its own.`,
				coverage
			);
		}

		const perDay = await this.rows<{ day: string; op: string; studio: boolean; n: string; fee: string }>(
			`WITH ${COVERED_CTE}
			SELECT d."day"::text AS day, d."operationType" AS op, (pa."address" IS NOT NULL) AS studio,
				SUM(d."count")::text AS n, SUM(d."feeNcheq")::text AS fee
			FROM "ledgerAddressDaily" d
			JOIN covered c ON c."address" = d."address"
			LEFT JOIN (SELECT DISTINCT "address" FROM "paymentAccount") pa ON pa."address" = d."address"
			WHERE d."day" >= $1::date AND d."day" <= $2::date
			GROUP BY 1, 2, 3`,
			[from, to]
		);
		const writers = await this.rows<{ studio: boolean; n: string }>(
			`WITH ${COVERED_CTE}
			SELECT (pa."address" IS NOT NULL) AS studio, COUNT(DISTINCT d."address")::text AS n
			FROM "ledgerAddressDaily" d
			JOIN covered c ON c."address" = d."address"
			LEFT JOIN (SELECT DISTINCT "address" FROM "paymentAccount") pa ON pa."address" = d."address"
			WHERE d."day" >= $1::date AND d."day" <= $2::date
			GROUP BY 1`,
			[from, to]
		);
		const retention = await this.rows<{ week: number | null; cohort: string; eligible: string; retained: string }>(
			`WITH ${COVERED_CTE},
			first AS (
				SELECT a."address", (a."firstWriteAt" AT TIME ZONE 'UTC')::date AS d0, a."dailyCompleteFrom" AS cf
				FROM "ledgerAddressActivity" a JOIN covered c ON c."address" = a."address"
				WHERE a."firstWriteAt" IS NOT NULL
					AND (a."firstWriteAt" AT TIME ZONE 'UTC')::date >= $1::date AND (a."firstWriteAt" AT TIME ZONE 'UTC')::date <= $2::date
			)
			SELECT k.week AS week, (SELECT COUNT(*) FROM first)::text AS cohort,
				COUNT(*) FILTER (WHERE f.d0 + (7 * k.week + 6) < $2::date AND (f.cf IS NULL OR f.cf <= f.d0 + 7 * k.week))::text AS eligible,
				COUNT(*) FILTER (WHERE f.d0 + (7 * k.week + 6) < $2::date AND (f.cf IS NULL OR f.cf <= f.d0 + 7 * k.week)
					AND EXISTS (SELECT 1 FROM "ledgerAddressDaily" d WHERE d."address" = f."address"
						AND d."day" >= f.d0 + 7 * k.week AND d."day" <= f.d0 + (7 * k.week + 6)))::text AS retained
			FROM (VALUES (1), (2), (4)) AS k(week)
			LEFT JOIN first f ON true
			GROUP BY k.week ORDER BY k.week`,
			[from, to]
		);

		// Writes by type and day, zero-filled
		const days = new Map<string, Record<WriteOperation, number>>();
		for (let t = today - (range - 1) * DAY_MS; t <= today; t += DAY_MS) {
			days.set(day(t), { createDid: 0, updateDid: 0, deactivateDid: 0, createResource: 0 });
		}
		const totals = { createDid: 0, updateDid: 0, deactivateDid: 0, createResource: 0 };
		const byOp = new Map<WriteOperation, { studio: [number, bigint]; other: [number, bigint] }>();
		for (const op of WRITE_OPERATIONS) byOp.set(op, { studio: [0, 0n], other: [0, 0n] });
		let studioWrites = 0;
		let otherWrites = 0;
		for (const row of perDay) {
			const op = row.op as WriteOperation;
			const point = days.get(row.day);
			if (!point || !byOp.has(op)) continue;
			const n = num(row.n);
			point[op] += n;
			totals[op] += n;
			const side = byOp.get(op)![row.studio ? 'studio' : 'other'];
			side[0] += n;
			side[1] += BigInt(row.fee ?? '0');
			if (row.studio) studioWrites += n;
			else otherWrites += n;
		}
		const sum = (a: [number, bigint], b: [number, bigint]): [number, bigint] => [a[0] + b[0], a[1] + b[1]];
		const fee = (v: [number, bigint]) => feeOf(v[0], v[1]);
		let allStudio: [number, bigint] = [0, 0n];
		let allOther: [number, bigint] = [0, 0n];
		const byOperation = WRITE_OPERATIONS.map((operationType) => {
			const v = byOp.get(operationType)!;
			allStudio = sum(allStudio, v.studio);
			allOther = sum(allOther, v.other);
			return {
				operationType,
				studioPayerAccounts: fee(v.studio),
				otherAddresses: fee(v.other),
				total: fee(sum(v.studio, v.other)),
			};
		});
		const total = studioWrites + otherWrites;
		const writerCount = (studio: boolean) => num(writers.find((w) => w.studio === studio)?.n);
		return {
			...base,
			coverage,
			writes: {
				supported: true,
				days: [...days.entries()].map(([date, p]) => ({
					date,
					...p,
					total: p.createDid + p.updateDid + p.deactivateDid + p.createResource,
				})),
				totals: { ...totals, total },
			},
			retention: {
				supported: true,
				definition: RETENTION_DEFINITION,
				cohort: num(retention[0]?.cohort),
				weeks: RETENTION_WEEKS.map((week) => {
					const row = retention.find((r) => num(r.week) === week);
					const eligible = num(row?.eligible);
					const retained = num(row?.retained);
					return {
						week,
						eligible,
						retained,
						share: eligible === 0 ? null : Math.round((retained / eligible) * 1000) / 1000,
					};
				}),
			},
			fees: {
				supported: true,
				basis: FEE_BASIS,
				denom: 'CHEQ',
				byOperation,
				totals: {
					studioPayerAccounts: fee(allStudio),
					otherAddresses: fee(allOther),
					total: fee(sum(allStudio, allOther)),
				},
			},
			channels: {
				supported: true,
				studioWrites,
				otherWrites,
				studioShare: total === 0 ? null : Math.round((studioWrites / total) * 1000) / 1000,
				writingAddresses: { studio: writerCount(true), other: writerCount(false) },
			},
			notes: [
				'Only funded testnet addresses whose per-day history is stored for the whole range are counted.',
				'Studio payer accounts are addresses held in Studio payment accounts; every other address is an SDK or other tool.',
				'Failed transactions are not in the source, so fees burnt on them are not included.',
			],
		};
	}
}
