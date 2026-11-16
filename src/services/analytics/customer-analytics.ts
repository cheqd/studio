import { Connection } from '../../database/connection/connection.js';
import type { Queryable } from '../admin/admin-analytics.js';

/**
 * Read-only analytics for ONE customer, for the portal's Analytics page. Counts only: nothing here selects a key,
 * a credential, a claim value, a holder or a verifier. Every statement is filtered by the customer id the caller
 * passes (taken from the authenticated session, never from a parameter), so one customer can never see another.
 *
 * What Studio cannot see is returned as `{ supported: false, reason }`, never as a zero, so the portal can show
 * "not available yet". See docs/analytics-endpoints.md.
 */
export const CUSTOMER_RANGES = [7, 30] as const;
export type CustomerRange = (typeof CUSTOMER_RANGES)[number];

export type Unsupported = { supported: false; reason: string };
export type Tile = { supported: true; value: number } | Unsupported;
export type Series = { supported: true; points: Array<{ date: string; count: number }> } | Unsupported;
export type Table<Row> = { supported: true; rows: Row[] } | Unsupported;

export interface CustomerAnalytics {
	audience: 'agents' | 'individuals';
	range: CustomerRange;
	from: string;
	to: string;
	tiles: Record<string, Tile>;
	series: Record<string, Series>;
	tables: Record<string, Table<unknown>>;
	/** Dotted keys of every element that is not supported, such as `tiles.verificationsReceived`. */
	unavailable: string[];
	notes: string[];
}

const num = (value: unknown): number => Number(value ?? 0);
const iso = (value: unknown): string | null => (value ? new Date(value as string | Date).toISOString() : null);
const unsupported = (reason: string): Unsupported => ({ supported: false, reason });
const tile = (value: unknown): Tile => ({ supported: true, value: num(value) });

/** Window: whole UTC days including today. `$1` is the range, `$2` the customer id. */
const WINDOW_CTE = `win AS (
	SELECT (date_trunc('day', now() AT TIME ZONE 'UTC') - (($1::int - 1) * interval '1 day')) AT TIME ZONE 'UTC' AS start,
		date_trunc('day', now() AT TIME ZONE 'UTC') - (($1::int - 1) * interval '1 day') AS start_day,
		date_trunc('day', now() AT TIME ZONE 'UTC') AS end_day
)`;

/** A successful tracked operation of this customer in the window. */
const operationCount = (name: string) =>
	`(SELECT COUNT(*) FROM "operation" o, win WHERE o."customerId" = $2::uuid AND o."operationName" = '${name}'
		AND o."createdAt" >= win.start AND o."successful" AND o."outcome" IS DISTINCT FROM 'error')`;

const CREDENTIAL_ISSUED = `ic."customerId" = $2::uuid AND ic."category" = 'credential' AND ic."status" NOT IN ('offered', 'rejected')`;

const NO_VERIFICATION_RECORD =
	'Studio does not record verifications per agent. The verify and resolve routes store no agent, holder or verifier, and failed verifications are not recorded.';

/** The formats Studio can store (`issuedCredential.format`), with the label the portal shows. mdoc is not one. */
export const CREDENTIAL_FORMATS: Array<{ format: string; label: string }> = [
	{ format: 'sd-jwt-vc', label: 'SD-JWT VC' },
	{ format: 'jwt', label: 'W3C JWT' },
	{ format: 'jsonld', label: 'W3C JSON-LD' },
	{ format: 'anoncreds', label: 'AnonCreds' },
];

function unavailableKeys(parts: Record<string, Record<string, { supported: boolean }>>): string[] {
	return Object.entries(parts).flatMap(([group, elements]) =>
		Object.entries(elements)
			.filter(([, element]) => !element.supported)
			.map(([key]) => `${group}.${key}`)
	);
}

export class CustomerAnalyticsService {
	public static instance = new CustomerAnalyticsService();

	constructor(private readonly db: () => Queryable = () => Connection.instance.dbConnection) {}

	private async rows<T = Record<string, unknown>>(sql: string, parameters: unknown[]): Promise<T[]> {
		return (await this.db().query(sql, parameters)) as T[];
	}

	/** First and last UTC day of the window, as dates. */
	static bounds(range: number, now: Date = new Date()): { from: string; to: string } {
		const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
		return { from: day(end - (range - 1) * 86_400_000), to: day(end) };
	}

	private perDay(range: CustomerRange, customerId: string, source: string, column: string, where: string) {
		return this.rows<{ date: string; count: string }>(
			`WITH ${WINDOW_CTE},
			per_day AS (
				SELECT date_trunc('day', ${column} AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
				FROM ${source}, win WHERE ${where} AND ${column} >= win.start
				GROUP BY 1
			)
			SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(p.count, 0) AS count
			FROM win CROSS JOIN generate_series(win.start_day, win.end_day, interval '1 day') AS d(day)
			LEFT JOIN per_day p ON p.day = d.day ORDER BY d.day`,
			[range, customerId]
		);
	}

	async agents(customerId: string, range: CustomerRange): Promise<CustomerAnalytics> {
		const [tileRows, perDay, activity] = await Promise.all([
			this.rows(
				`WITH ${WINDOW_CTE}
				SELECT
					(SELECT COUNT(*) FROM "agent" a, win WHERE a."customerId" = $2::uuid AND a."createdAt" >= win.start) AS "agentsRegistered",
					(SELECT COUNT(*) FROM "authorityGrant" g, win WHERE g."customerId" = $2::uuid AND g."createdAt" >= win.start) AS "authorityGranted",
					(SELECT COUNT(*) FROM "authorityGrant" g, win WHERE g."customerId" = $2::uuid AND g."revokedAt" >= win.start) AS "authorityRevoked"`,
				[range, customerId]
			),
			this.perDay(range, customerId, `"agentEvent" e`, 'e."createdAt"', `e."customerId" = $2::uuid`),
			this.rows(
				`WITH ${WINDOW_CTE}
				SELECT a."agentId", a."name",
					COUNT(e."id") FILTER (WHERE e."createdAt" >= (SELECT start FROM win)) AS events,
					MAX(e."createdAt") AS "lastActivityAt"
				FROM "agent" a LEFT JOIN "agentEvent" e ON e."agentId" = a."agentId"
				WHERE a."customerId" = $2::uuid AND a."deletedAt" IS NULL
				GROUP BY a."agentId", a."name" ORDER BY events DESC, a."name", a."agentId" LIMIT 100`,
				[range, customerId]
			),
		]);
		const counts = tileRows[0] ?? {};
		const tiles: Record<string, Tile> = {
			verificationsReceived: unsupported(NO_VERIFICATION_RECORD),
			passedPercent: unsupported('Pass or fail is not recorded: a failed verification emits no event.'),
			mandateChecks: unsupported('Mandate checks are not tracked by Studio.'),
			agentCardFetches: unsupported(
				'Agent cards are read from the ledger or a resolver, not through Studio, so fetches are not seen.'
			),
			agentsRegistered: tile(counts.agentsRegistered),
			authorityGranted: tile(counts.authorityGranted),
			authorityRevoked: tile(counts.authorityRevoked),
		};
		const series: Record<string, Series> = {
			verificationsPerDay: unsupported(NO_VERIFICATION_RECORD),
			agentActivityPerDay: {
				supported: true,
				points: perDay.map((r) => ({ date: r.date, count: num(r.count) })),
			},
		};
		const tables: Record<string, Table<unknown>> = {
			byAgent: unsupported(NO_VERIFICATION_RECORD),
			topVerifiers: unsupported(
				'Verifier identity is not stored, and callers who are not signed in to Studio are not recorded at all.'
			),
			byProtocol: unsupported('Card fetches, mandate checks, delegation checks and MCP calls are not recorded.'),
			agentActivity: {
				supported: true,
				rows: activity.map((r) => ({
					agentId: r.agentId as string,
					name: r.name as string,
					events: num(r.events),
					lastActivityAt: iso(r.lastActivityAt),
				})),
			},
		};
		return {
			audience: 'agents',
			range,
			...CustomerAnalyticsService.bounds(range),
			tiles,
			series,
			tables,
			unavailable: unavailableKeys({ tiles, series, tables }),
			notes: [
				'Verifications of your agents by other people are not recorded yet. Agent activity counts changes you made: registrations, grants, revocations, keys and cards.',
			],
		};
	}

	async individuals(customerId: string, range: CustomerRange): Promise<CustomerAnalytics> {
		const [tileRows, perDay, formats] = await Promise.all([
			this.rows(
				`WITH ${WINDOW_CTE}
				SELECT
					(SELECT COUNT(*) FROM "issuedCredential" ic, win WHERE ${CREDENTIAL_ISSUED} AND ic."issuedAt" >= win.start) AS "credentialsIssued",
					${operationCount('presentation-verify')} AS "presentationsVerified",
					(SELECT COUNT(*) FROM "issuedCredential" ic, win WHERE ic."customerId" = $2::uuid AND ic."category" = 'credential' AND ic."status" = 'revoked' AND ic."statusUpdatedAt" >= win.start) AS "revoked",
					${operationCount('credential-status-check')} AS "statusChecks"`,
				[range, customerId]
			),
			this.perDay(range, customerId, `"issuedCredential" ic`, 'ic."issuedAt"', CREDENTIAL_ISSUED),
			this.rows<{ format: string; count: string }>(
				`WITH ${WINDOW_CTE}
				SELECT ic."format" AS format, COUNT(*) AS count FROM "issuedCredential" ic, win
				WHERE ${CREDENTIAL_ISSUED} AND ic."issuedAt" >= win.start GROUP BY ic."format"`,
				[range, customerId]
			),
		]);
		const counts = tileRows[0] ?? {};
		const byFormat = new Map(formats.map((r) => [r.format, num(r.count)]));
		const known = new Set(CREDENTIAL_FORMATS.map((f) => f.format));
		const tiles: Record<string, Tile> = {
			credentialsIssued: tile(counts.credentialsIssued),
			presentationsVerified: tile(counts.presentationsVerified),
			revoked: tile(counts.revoked),
			statusChecks: tile(counts.statusChecks),
		};
		const series: Record<string, Series> = {
			credentialsIssuedPerDay: {
				supported: true,
				points: perDay.map((r) => ({ date: r.date, count: num(r.count) })),
			},
		};
		const tables: Record<string, Table<unknown>> = {
			byFormat: {
				supported: true,
				rows: [
					...CREDENTIAL_FORMATS.map(({ format, label }) => ({
						format,
						label,
						count: byFormat.get(format) ?? 0,
					})),
					// a format added later is shown as it is rather than dropped
					...[...byFormat]
						.filter(([format]) => !known.has(format))
						.map(([format, count]) => ({ format, label: format, count })),
				],
			},
			partnerHandoffs: unsupported(
				'Hand-offs to partners start in the portal, so Studio never sees them. They need portal events.'
			),
		};
		return {
			audience: 'individuals',
			range,
			...CustomerAnalyticsService.bounds(range),
			tiles,
			series,
			tables,
			unavailable: unavailableKeys({ tiles, series, tables }),
			notes: [
				'Presentations verified and status checks count calls made with your account. Credentials held in wallets, and other people checking your status lists, are not seen by Studio.',
				'mdoc is not a format Studio issues, so it is not listed.',
			],
		};
	}
}
