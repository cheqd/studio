import { Connection } from '../../database/connection/connection.js';
import type { Table, Tile, Unsupported } from '../analytics/customer-analytics.js';

/**
 * Read-only staff queries over Studio's own tables: customers, usage, funnels and the audit log. Counts only: nothing
 * here selects a key, a credential, a claim value or an API key, and every query is one SQL statement over the
 * whole customer set (no per-customer loops), sized for hundreds of customers and thousands of operations a month.
 *
 * Segment rule (proposal): `agents` = the customer has at least one non-deleted agent; `people` = no agents, but it
 * has issued a credential (`customerActivation.firstCredentialIssuedAt` is set); `unclassified` = everything else.
 * An agent wins over a credential, so a customer that does both counts as `agents`.
 */
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const SEGMENTS = ['agents', 'people', 'unclassified', 'all'] as const;
export type Segment = (typeof SEGMENTS)[number];
export const JOURNEYS = ['first-credential', 'first-agent'] as const;
export type Journey = (typeof JOURNEYS)[number];

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_TOP_LIMIT = 10;
/** Customers with no tracked operation in this many days show as `inactive`. */
export const ACTIVE_WINDOW_DAYS = 30;

/** Role names (the Stripe product name, set at sign-up) that count as a paid plan. Override with PAID_PLAN_NAMES. */
export function paidPlanNames(): string[] {
	return (process.env.PAID_PLAN_NAMES || 'build')
		.split(',')
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean);
}

export interface Queryable {
	query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface CustomerUsage {
	apiCalls30d: number;
	identifiers: number;
	credentials: number;
	/** @deprecated The count of DID keys, kept for compatibility. Use `didKeys`; it was never API keys. */
	keys: number;
	/** DID keys (rows in `key`). */
	didKeys: number;
	/** API keys that are not revoked. */
	apiKeys: number;
}
export interface CustomerSummary {
	id: string;
	name: string;
	email: string;
	plan: string;
	network: 'mainnet' | 'testnet';
	createdAt: string;
	lastActiveAt: string | null;
	status: 'active' | 'inactive';
	usage: CustomerUsage;
}
export interface CustomerDetail extends CustomerSummary {
	paymentPlan: string;
	agentCount: number;
	segment: Exclude<Segment, 'all'>;
}

const num = (value: unknown): number => Number(value ?? 0);
const iso = (value: unknown): string | null => (value ? new Date(value as string | Date).toISOString() : null);

/**
 * Segment of each customer. `$2` is the requested segment; use `SEGMENT_FILTER(alias)` to apply it. Computed once
 * per statement from `agent` (indexed on customerId) and `customerActivation` (one row per customer).
 */
const SEGMENT_CTE = `seg AS (
	SELECT c."customerId",
		CASE
			WHEN EXISTS (SELECT 1 FROM "agent" a WHERE a."customerId" = c."customerId" AND a."deletedAt" IS NULL) THEN 'agents'
			WHEN ca."firstCredentialIssuedAt" IS NOT NULL THEN 'people'
			ELSE 'unclassified'
		END AS segment
	FROM "customer" c
	LEFT JOIN "customerActivation" ca ON ca."customerId" = c."customerId"
)`;
const segmentFilter = (column: string) =>
	`($2 = 'all' OR ${column} IN (SELECT "customerId" FROM seg WHERE segment = $2))`;

/** Window: whole UTC days, so the per-day series and the totals agree. `start` is a timestamptz. */
const WINDOW_CTE = `win AS (
	SELECT (date_trunc('day', now() AT TIME ZONE 'UTC') - (($1::int - 1) * interval '1 day')) AT TIME ZONE 'UTC' AS start,
		date_trunc('day', now() AT TIME ZONE 'UTC') - (($1::int - 1) * interval '1 day') AS start_day,
		date_trunc('day', now() AT TIME ZONE 'UTC') AS end_day
)`;

const PLAN_EXPR = `COALESCE((SELECT NULLIF(NULLIF(r."name", ''), 'default') FROM "user" u JOIN "role" r ON r."roleTypeId" = u."roleTypeId" WHERE u."customerId" = c."customerId" ORDER BY u."createdAt" LIMIT 1), 'none')`;

/** What `operation.operationName` stands for, as the route that records it. Unknown names are shown as they are. */
const OPERATION_ROUTES: Record<string, [string, string]> = {
	'did-create': ['POST', '/did/create'],
	'did-update': ['POST', '/did/update'],
	'did-import': ['POST', '/did/import'],
	'did-deactivate': ['POST', '/did/deactivate/:did'],
	'did-list': ['GET', '/did/list'],
	'did-search': ['GET', '/did/search/:did'],
	'did-export': ['POST', '/did/export/:did'],
	'resource-create': ['POST', '/resource/create/:did'],
	'resource-search': ['GET', '/resource/search/:did'],
	'credential-issue': ['POST', '/credential/issue'],
	'credential-verify': ['POST', '/credential/verify'],
	'credential-revoke': ['POST', '/credential/revoke'],
	'credential-suspend': ['POST', '/credential/suspend'],
	'credential-unsuspend': ['POST', '/credential/reinstate'],
	'credential-status-create-unencrypted': ['POST', '/credential-status/create/unencrypted'],
	'credential-status-create-encrypted': ['POST', '/credential-status/create/encrypted'],
	'credential-status-update-unencrypted': ['POST', '/credential-status/update/unencrypted'],
	'credential-status-update-encrypted': ['POST', '/credential-status/update/encrypted'],
	'credential-status-check': ['POST', '/credential-status/check'],
	'credential-status-search': ['GET', '/credential-status/search'],
	'key-create': ['POST', '/key/create'],
	'key-import': ['POST', '/key/import'],
	'key-read': ['GET', '/key/read/:kid'],
	'presentation-create': ['POST', '/presentation/create'],
	'presentation-verify': ['POST', '/presentation/verify'],
	'account-create': ['POST', '/account'],
	'account-get': ['GET', '/account'],
};

/** Tracked operations that write to the ledger through Studio, grouped as the Faucet to ledger tab shows them. */
const DID_WRITES = ['did-create', 'did-update', 'did-deactivate'];
const STATUS_LIST_WRITES = [
	'credential-status-create-unencrypted',
	'credential-status-create-encrypted',
	'credential-status-update-unencrypted',
	'credential-status-update-encrypted',
	'credential-revoke',
	'credential-suspend',
	'credential-unsuspend',
];
const RESOURCE_WRITES = ['resource-create'];
const FAUCET_WRITE_OPERATIONS = [...DID_WRITES, ...STATUS_LIST_WRITES, ...RESOURCE_WRITES];

export function routeForOperation(operationName: string): { route: string; method: string } {
	const known = OPERATION_ROUTES[operationName];
	return known ? { method: known[0], route: known[1] } : { method: '', route: operationName };
}

export class AdminAnalyticsService {
	public static instance = new AdminAnalyticsService();

	constructor(private readonly db: () => Queryable = () => Connection.instance.dbConnection) {}

	private async rows<T = Record<string, unknown>>(sql: string, parameters: unknown[] = []): Promise<T[]> {
		return (await this.db().query(sql, parameters)) as T[];
	}

	// --- Customers -----------------------------------------------------------------------------------------

	private static customerSelect(where: string, extra = ''): string {
		return `
			SELECT c."customerId" AS id, c."name", c."email", c."createdAt", ${PLAN_EXPR} AS plan,
				(SELECT MAX(o."createdAt") FROM "operation" o WHERE o."customerId" = c."customerId") AS "lastActiveAt"
				${extra}
			FROM "customer" c ${where}`;
	}

	private static usageColumns(alias: string): string {
		return `
			(SELECT COUNT(*) FROM "operation" o WHERE o."customerId" = ${alias}.id AND o."createdAt" >= now() - interval '${ACTIVE_WINDOW_DAYS} days') AS "apiCalls30d",
			(SELECT COUNT(*) FROM "identifier" i WHERE i."customerId" = ${alias}.id) AS identifiers,
			(SELECT COUNT(*) FROM "issuedCredential" ic WHERE ic."customerId" = ${alias}.id AND ic."category" = 'credential') AS credentials,
			(SELECT COUNT(*) FROM "key" k WHERE k."customerId" = ${alias}.id) AS keys,
			(SELECT COUNT(*) FROM "apiKey" ak WHERE ak."customerId" = ${alias}.id AND ak."revoked" = false) AS "apiKeys",
			CASE WHEN EXISTS (SELECT 1 FROM "identifier" i WHERE i."customerId" = ${alias}.id AND i."provider" LIKE 'did:cheqd:mainnet%') THEN 'mainnet' ELSE 'testnet' END AS network`;
	}

	private static toSummary(row: Record<string, unknown>): CustomerSummary {
		const lastActive = iso(row.lastActiveAt);
		const recent =
			lastActive !== null && Date.now() - new Date(lastActive).getTime() <= ACTIVE_WINDOW_DAYS * 86_400_000;
		return {
			id: row.id as string,
			name: row.name as string,
			email: row.email as string,
			plan: row.plan as string,
			network: row.network === 'mainnet' ? 'mainnet' : 'testnet',
			createdAt: iso(row.createdAt) as string,
			lastActiveAt: lastActive,
			status: recent ? 'active' : 'inactive',
			usage: {
				apiCalls30d: num(row.apiCalls30d),
				identifiers: num(row.identifiers),
				credentials: num(row.credentials),
				keys: num(row.keys),
				didKeys: num(row.keys),
				apiKeys: num(row.apiKeys),
			},
		};
	}

	/**
	 * Customers, newest first. `q` matches name, email or id (case-insensitive, substring; the id as a prefix or in
	 * full). `plan` is a case-insensitive plan name; `status` is `active` or `inactive`. The plan and last-active
	 * columns are worked out for every matching customer (hundreds of rows, using the operation index), the usage
	 * counts only for the page returned.
	 */
	async listCustomers(filter: {
		q?: string;
		plan?: string;
		status?: string;
		page: number;
		limit: number;
	}): Promise<{ customers: CustomerSummary[]; total: number }> {
		const like = filter.q ? `%${filter.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : '';
		const base = AdminAnalyticsService.customerSelect(
			`WHERE ($1 = '' OR c."name" ILIKE $1 OR c."email" ILIKE $1 OR c."customerId"::text ILIKE $1)`
		);
		const filtered = `filtered AS (
			SELECT b.*, CASE WHEN b."lastActiveAt" >= now() - interval '${ACTIVE_WINDOW_DAYS} days' THEN 'active' ELSE 'inactive' END AS status
			FROM (${base}) b
		), kept AS (
			SELECT * FROM filtered WHERE ($2 = '' OR lower(plan) = lower($2)) AND ($3 = '' OR status = $3)
		)`;
		const parameters = [like, filter.plan ?? '', filter.status ?? ''];
		const [pageRows, totalRows] = await Promise.all([
			this.rows(
				`WITH ${filtered}, page AS (SELECT * FROM kept ORDER BY "createdAt" DESC, id LIMIT $4 OFFSET $5)
				 SELECT page.*, ${AdminAnalyticsService.usageColumns('page')} FROM page ORDER BY page."createdAt" DESC, page.id`,
				[...parameters, filter.limit, (filter.page - 1) * filter.limit]
			),
			this.rows<{ total: string }>(`WITH ${filtered} SELECT COUNT(*) AS total FROM kept`, parameters),
		]);
		return { customers: pageRows.map(AdminAnalyticsService.toSummary), total: num(totalRows[0]?.total) };
	}

	async getCustomer(customerId: string): Promise<CustomerDetail | null> {
		const rows = await this.rows(
			`WITH ${SEGMENT_CTE},
			one AS (${AdminAnalyticsService.customerSelect(
				`WHERE c."customerId" = $1::uuid`,
				`, COALESCE((SELECT s."status" FROM "subscription" s WHERE s."customerId" = c."customerId" ORDER BY s."createdAt" DESC LIMIT 1), 'none') AS "paymentPlan",
				(SELECT COUNT(*) FROM "agent" a WHERE a."customerId" = c."customerId" AND a."deletedAt" IS NULL) AS "agentCount"`
			)})
			SELECT one.*, ${AdminAnalyticsService.usageColumns('one')},
				(SELECT segment FROM seg WHERE seg."customerId" = one.id) AS segment
			FROM one`,
			[customerId]
		);
		if (rows.length === 0) return null;
		const row = rows[0];
		return {
			...AdminAnalyticsService.toSummary(row),
			paymentPlan: row.paymentPlan as string,
			agentCount: num(row.agentCount),
			segment: row.segment as CustomerDetail['segment'],
		};
	}

	/** The plan name of one customer, and whether it counts as paid. Used to guard deletion. */
	async getPlan(customerId: string): Promise<{ plan: string; paid: boolean }> {
		const rows = await this.rows<{ plan: string }>(
			`SELECT ${PLAN_EXPR} AS plan FROM "customer" c WHERE c."customerId" = $1::uuid`,
			[customerId]
		);
		const plan = rows[0]?.plan ?? 'none';
		return { plan, paid: paidPlanNames().includes(plan.toLowerCase()) };
	}

	// --- Analytics -----------------------------------------------------------------------------------------

	async overview(range: Range, segment: Segment) {
		const parameters = [range, segment];
		const [tileRows, signUps, calls] = await Promise.all([
			this.rows(
				`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
				SELECT
					(SELECT COUNT(*) FROM "customer" c, win WHERE c."createdAt" >= win.start AND ${segmentFilter('c."customerId"')}) AS "signUps",
					(SELECT COUNT(DISTINCT o."customerId") FROM "operation" o, win WHERE o."createdAt" >= win.start AND o."customerId" IS NOT NULL AND ${segmentFilter('o."customerId"')}) AS "activeAccounts",
					(SELECT COUNT(*) FROM "customerActivation" ca, win WHERE ca."firstAgentRegisteredAt" >= win.start AND ${segmentFilter('ca."customerId"')}) AS "registeredAnAgent",
					(SELECT COUNT(*) FROM "customerActivation" ca, win WHERE ca."firstCredentialIssuedAt" >= win.start AND ${segmentFilter('ca."customerId"')}) AS "issuedACredential",
					(SELECT COUNT(*) FROM "operation" o, win WHERE o."createdAt" >= win.start AND ${segmentFilter('o."customerId"')}) AS "apiCalls",
					(SELECT COALESCE(SUM(fr."amountNcheq"), 0) / 1000000000 FROM "faucetRequest" fr, win WHERE fr."createdAt" >= win.start AND fr."status" = 'completed' AND ${segmentFilter('fr."customerId"')}) AS "testCheqSent"`,
				parameters
			),
			this.rows<{ date: string; count: string }>(
				`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
				SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COUNT(c."customerId") AS count
				FROM win CROSS JOIN generate_series(win.start_day, win.end_day, interval '1 day') AS d(day)
				LEFT JOIN "customer" c ON date_trunc('day', c."createdAt" AT TIME ZONE 'UTC') = d.day AND c."createdAt" >= win.start AND ${segmentFilter('c."customerId"')}
				GROUP BY d.day ORDER BY d.day`,
				parameters
			),
			this.rows<{ date: string; count: string }>(
				`WITH ${WINDOW_CTE}, ${SEGMENT_CTE},
				per_day AS (
					SELECT date_trunc('day', o."createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
					FROM "operation" o, win WHERE o."createdAt" >= win.start AND ${segmentFilter('o."customerId"')}
					GROUP BY 1
				)
				SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(p.count, 0) AS count
				FROM win CROSS JOIN generate_series(win.start_day, win.end_day, interval '1 day') AS d(day)
				LEFT JOIN per_day p ON p.day = d.day ORDER BY d.day`,
				parameters
			),
		]);
		const tiles = tileRows[0] ?? {};
		return {
			tiles: {
				signUps: num(tiles.signUps),
				activeAccounts: num(tiles.activeAccounts),
				registeredAnAgent: num(tiles.registeredAnAgent),
				issuedACredential: num(tiles.issuedACredential),
				apiCalls: num(tiles.apiCalls),
				testCheqSent: num(tiles.testCheqSent),
			},
			series: {
				signUpsPerDay: signUps.map((r) => ({ date: r.date, count: num(r.count) })),
				apiCallsPerDay: calls.map((r) => ({ date: r.date, count: num(r.count) })),
			},
		};
	}

	/**
	 * Tracked operations by name. Studio writes an `operation` row for the operations it meters (DIDs, resources,
	 * credentials, status lists, keys, presentations, accounts), not for every HTTP request, so `calls` counts those.
	 * A call failed when `successful` is false or `outcome` is `error`. `avgMs` is 0 where no duration was recorded.
	 */
	async endpoints(range: Range, segment: Segment) {
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
			SELECT o."operationName" AS name, COUNT(*) AS calls,
				COUNT(*) FILTER (WHERE NOT o."successful" OR o."outcome" = 'error') AS failed,
				AVG(o."durationMs") AS "avgMs"
			FROM "operation" o, win
			WHERE o."createdAt" >= win.start AND ${segmentFilter('o."customerId"')}
			GROUP BY o."operationName" ORDER BY calls DESC, name LIMIT 100`,
			[range, segment]
		);
		return rows.map((r) => {
			const calls = num(r.calls);
			return {
				...routeForOperation(r.name as string),
				calls,
				errorRate: calls ? Math.round((num(r.failed) / calls) * 10_000) / 10_000 : 0,
				avgMs: Math.round(num(r.avgMs)),
			};
		});
	}

	async topAccounts(range: Range, segment: Segment, limit: number) {
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
			SELECT c."customerId" AS "customerId", c."name", ${PLAN_EXPR} AS plan, COUNT(*) AS calls
			FROM "operation" o JOIN "customer" c ON c."customerId" = o."customerId", win
			WHERE o."createdAt" >= win.start AND ${segmentFilter('o."customerId"')}
			GROUP BY c."customerId", c."name" ORDER BY calls DESC, c."customerId" LIMIT $3`,
			[range, segment, limit]
		);
		return rows.map((r) => ({
			customerId: r.customerId as string,
			name: r.name as string,
			plan: r.plan as string,
			calls: num(r.calls),
		}));
	}

	async planMix() {
		const rows = await this.rows(
			`SELECT ${PLAN_EXPR} AS plan, COUNT(*) AS accounts FROM "customer" c GROUP BY 1 ORDER BY accounts DESC, plan`
		);
		const plans = rows.map((r) => ({ plan: r.plan as string, accounts: num(r.accounts) }));
		const total = plans.reduce((sum, p) => sum + p.accounts, 0);
		const paid = plans
			.filter((p) => paidPlanNames().includes(p.plan.toLowerCase()))
			.reduce((s, p) => s + p.accounts, 0);
		return { plans, paidPercent: total ? Math.round((paid / total) * 1000) / 10 : 0 };
	}

	/**
	 * Funnel over the customers who signed up in the range (and are in the segment). A customer counts at a step only
	 * if it reached every step before it, so each step is at most the one above. `medianSecondsFromPrevious` is the
	 * median gap between a step and the one before it among customers who reached it (never negative: a milestone
	 * recorded before the step above counts as 0), and null for the first step or when nobody reached it.
	 *
	 * Journey A: signed up, funded address (a completed faucet request), first DID, first credential issued.
	 * Journey B: signed up, funded address, first DID, registered an agent, agent card signed.
	 * The faucet table keeps a limited history (see FAUCET_REQUEST_RETENTION_MONTHS), so "funded" can undercount for
	 * very old customers; the ranges here are at most 90 days.
	 */
	async funnel(journey: Journey, range: Range, segment: Segment) {
		const steps =
			journey === 'first-credential'
				? [
						{ key: 'signed-up', label: 'Signed up', column: 'j.signed' },
						{ key: 'funded', label: 'Funded address', column: 'j.funded' },
						{ key: 'first-did', label: 'First DID created', column: 'j.did' },
						{ key: 'first-credential', label: 'First credential issued', column: 'j.credential' },
					]
				: [
						{ key: 'signed-up', label: 'Signed up', column: 'j.signed' },
						{ key: 'funded', label: 'Funded address', column: 'j.funded' },
						{ key: 'first-did', label: 'First DID created', column: 'j.did' },
						{ key: 'registered-agent', label: 'Registered an agent', column: 'j.agent' },
						{ key: 'card-signed', label: 'Agent card signed', column: 'j.card' },
					];
		// Step i is reached when columns 0..i are all set; its gap is column i minus column i-1
		const selects = steps.map((step, i) => {
			const reached = steps
				.slice(0, i + 1)
				.map((s) => `${s.column} IS NOT NULL`)
				.join(' AND ');
			const gap =
				i === 0
					? 'NULL::float'
					: `percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (${step.column} - ${steps[i - 1].column})))) FILTER (WHERE ${reached})`;
			return `COUNT(*) FILTER (WHERE ${reached}) AS "accounts${i}", ${gap} AS "gap${i}"`;
		});
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE},
			cohort AS (
				SELECT c."customerId", c."createdAt" AS signed FROM "customer" c, win
				WHERE c."createdAt" >= win.start AND ${segmentFilter('c."customerId"')}
			),
			funded AS (
				SELECT fr."customerId", MIN(fr."createdAt") AS at FROM "faucetRequest" fr
				WHERE fr."status" = 'completed' AND fr."customerId" IN (SELECT "customerId" FROM cohort) GROUP BY fr."customerId"
			),
			cards AS (
				SELECT ac."customerId", MIN(ac."createdAt") AS at FROM "agentCard" ac
				WHERE ac."jws" IS NOT NULL AND ac."customerId" IN (SELECT "customerId" FROM cohort) GROUP BY ac."customerId"
			),
			j AS (
				SELECT cohort.signed, funded.at AS funded, ca."firstDidCreatedAt" AS did, ca."firstCredentialIssuedAt" AS credential,
					ca."firstAgentRegisteredAt" AS agent, cards.at AS card
				FROM cohort
				LEFT JOIN funded ON funded."customerId" = cohort."customerId"
				LEFT JOIN "customerActivation" ca ON ca."customerId" = cohort."customerId"
				LEFT JOIN cards ON cards."customerId" = cohort."customerId"
			)
			SELECT ${selects.join(', ')} FROM j`,
			[range, segment]
		);
		const row = rows[0] ?? {};
		return {
			journey,
			steps: steps.map((step, i) => ({
				key: step.key,
				label: step.label,
				accounts: num(row[`accounts${i}`]),
				medianSecondsFromPrevious:
					i === 0 || row[`gap${i}`] === null || row[`gap${i}`] === undefined
						? null
						: Math.round(num(row[`gap${i}`])),
			})),
		};
	}

	/**
	 * Faucet to ledger, from what Studio records. The unit is a funded address: the first completed faucet request for
	 * an address, if it falls in the range (and the requesting customer is in the segment). Studio only sees faucet
	 * requests made by signed-in customers, so every funded address belongs to a customer, and it sees no ledger
	 * writes made outside Studio. So "wrote" here means a tracked, successful write operation (DID, status list or
	 * resource) by the customer on testnet after the funding, and only for addresses that are the customer's own
	 * payer account (`paymentAccount`), where an address and a customer are the same thing. Anything that needs the
	 * ledger itself comes back as `{ supported: false, reason }`.
	 */
	async faucetToLedger(range: Range, segment: Segment) {
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE},
			first AS (
				SELECT DISTINCT ON (fr."address") fr."address" AS address, fr."customerId" AS "customerId", fr."createdAt" AS funded_at
				FROM "faucetRequest" fr WHERE fr."status" = 'completed'
				ORDER BY fr."address", fr."createdAt"
			),
			cohort AS (
				SELECT f.address, f."customerId", f.funded_at,
					EXISTS (SELECT 1 FROM "paymentAccount" pa WHERE pa."address" = f.address AND pa."customerId" = f."customerId") AS own,
					(SELECT COUNT(*) FROM "faucetRequest" r WHERE r."address" = f.address AND r."status" = 'completed') AS requests
				FROM first f, win
				WHERE f.funded_at >= win.start AND ${segmentFilter('f."customerId"')}
			),
			per_address AS (
				SELECT c.address, c.own, c.requests, c.funded_at,
					MIN(o."createdAt") AS first_write, COUNT(o."operationId") AS writes,
					COALESCE(bool_or(o."operationName" = ANY($4::text[])), false) AS did,
					COALESCE(bool_or(o."operationName" = ANY($5::text[])), false) AS lists,
					COALESCE(bool_or(o."operationName" = ANY($6::text[])), false) AS other
				FROM cohort c
				LEFT JOIN "operation" o ON c.own AND o."customerId" = c."customerId" AND o."createdAt" >= c.funded_at
					AND o."network" = 'testnet' AND o."successful" AND o."outcome" IS DISTINCT FROM 'error'
					AND o."operationName" = ANY($3::text[])
				GROUP BY c.address, c.own, c.requests, c.funded_at
			)
			SELECT COUNT(*) AS funded,
				COUNT(*) FILTER (WHERE own) AS own,
				COUNT(*) FILTER (WHERE own AND first_write <= funded_at + interval '7 days') AS "firstWrite7d",
				COUNT(*) FILTER (WHERE own AND writes >= 2) AS "wroteAgain",
				COUNT(*) FILTER (WHERE requests >= 2) AS "toppedUp",
				COUNT(*) FILTER (WHERE did) AS did, COUNT(*) FILTER (WHERE lists) AS lists, COUNT(*) FILTER (WHERE other) AS other,
				COUNT(*) FILTER (WHERE first_write IS NOT NULL AND first_write - funded_at < interval '1 hour') AS "withinHour",
				COUNT(*) FILTER (WHERE first_write - funded_at >= interval '1 hour' AND first_write - funded_at < interval '1 day') AS "withinDay",
				COUNT(*) FILTER (WHERE first_write - funded_at >= interval '1 day' AND first_write - funded_at < interval '7 days') AS "withinWeek",
				COUNT(*) FILTER (WHERE first_write - funded_at >= interval '7 days' AND first_write - funded_at < interval '30 days') AS "withinMonth"
			FROM per_address`,
			[range, segment, FAUCET_WRITE_OPERATIONS, DID_WRITES, STATUS_LIST_WRITES, RESOURCE_WRITES]
		);
		const r = rows[0] ?? {};
		const ledger = (what: string): Unsupported => ({
			supported: false,
			reason: `${what} needs the ledger itself: Studio sees only the writes it makes for a customer, not writes made with an SDK or another tool. A ledger indexer is not built (decision A3).`,
		});
		const tile = (value: unknown): Tile => ({ supported: true, value: num(value) });
		const table = <Row>(rowList: Row[]): Table<Row> => ({ supported: true, rows: rowList });
		const tiles: Record<string, Tile> = {
			fundedAddresses: tile(r.funded),
			fundedToOwnAccount: tile(r.own),
			wroteViaStudioWithin7Days: tile(r.firstWrite7d),
			savedToProfile: {
				supported: false,
				reason: 'Studio only records faucet requests made by signed-in customers, so every funded address is already linked to an account and the share would always read 100%. Funding without an account is not recorded (decision A3).',
			},
			wroteToLedgerWithin7Days: ledger('Writes to the ledger within 7 days'),
			stillOffLedger: ledger('Addresses still off the ledger'),
		};
		const funnel = table([
			{ key: 'funded', label: 'Funded from the faucet', addresses: num(r.funded), basis: 'all-funded' },
			{
				key: 'first-studio-write-7d',
				label: 'First write through Studio within 7 days',
				addresses: num(r.firstWrite7d),
				basis: 'own-account',
			},
			{
				key: 'wrote-again',
				label: 'Wrote again through Studio (2 or more)',
				addresses: num(r.wroteAgain),
				basis: 'own-account',
			},
			{
				key: 'topped-up',
				label: 'Came back for another top-up',
				addresses: num(r.toppedUp),
				basis: 'all-funded',
			},
		]);
		const writeKinds = table([
			{ key: 'did', label: 'DID created or updated', addresses: num(r.did) },
			{ key: 'status-list', label: 'Status list or revocation update', addresses: num(r.lists) },
			{ key: 'other-resource', label: 'Other linked resources', addresses: num(r.other) },
		]);
		const timeToFirstWrite = table([
			{ key: 'within-hour', label: 'Within the hour', addresses: num(r.withinHour) },
			{ key: 'within-day', label: 'Within a day', addresses: num(r.withinDay) },
			{ key: 'within-week', label: 'Within a week', addresses: num(r.withinWeek) },
			{ key: 'within-month', label: 'Within a month', addresses: num(r.withinMonth) },
		]);
		const ledgerFunnel = ledger('The faucet to ledger funnel');
		const ledgerVsStudioJourneys = ledger('The ledger writes and Studio journeys table');
		const days = 86_400_000;
		const end = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
		const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
		const unavailable = [
			...Object.entries(tiles)
				.filter(([, item]) => !item.supported)
				.map(([key]) => `tiles.${key}`),
			'ledgerFunnel',
			'ledgerVsStudioJourneys',
		];
		return {
			range,
			segment,
			from: day(end - (range - 1) * days),
			to: day(end),
			network: 'testnet' as const,
			tiles,
			funnel,
			ledgerFunnel,
			writeKinds,
			timeToFirstWrite,
			ledgerVsStudioJourneys,
			unavailable,
			notes: [
				"Writes are the ones Studio made for the customer on testnet, counted only for addresses that are the customer's own Studio account. The steps marked own-account use fundedToOwnAccount as their denominator.",
				'Writes made with an SDK outside Studio are not seen, so first-write figures undercount. Operations recorded before the network was stored are not attributed.',
				'Cohorts are cut short by today, so the 7-day and later buckets are incomplete for recent funding. The faucet table keeps a limited history.',
			],
		};
	}

	// --- Audit log -----------------------------------------------------------------------------------------

	/**
	 * Staff actions, newest first. `staff` is the acting staff member's Studio email when the actor is a known user,
	 * otherwise the actor id as recorded. `target` is the customer id (the row outlives the customer); the audit log
	 * never stores a customer's name or email.
	 */
	async auditLog(page: number, limit: number) {
		const [entries, total] = await Promise.all([
			this.rows(
				`SELECT a."id", a."createdAt" AS "when", COALESCE(sc."email", a."actorUserId") AS staff, a."action",
					a."targetCustomerId" AS target, a."reason", a."ticketRef"
				FROM "adminAuditLog" a
				LEFT JOIN "user" su ON su."logToId" = a."actorUserId"
				LEFT JOIN "customer" sc ON sc."customerId" = su."customerId"
				ORDER BY a."createdAt" DESC, a."id" LIMIT $1 OFFSET $2`,
				[limit, (page - 1) * limit]
			),
			this.rows<{ total: string }>(`SELECT COUNT(*) AS total FROM "adminAuditLog"`),
		]);
		return {
			entries: entries.map((r) => ({
				id: r.id as string,
				when: iso(r.when) as string,
				staff: r.staff as string,
				action: r.action as string,
				target: (r.target as string | null) ?? null,
				reason: r.reason as string,
				ticketRef: (r.ticketRef as string | null) ?? null,
			})),
			total: num(total[0]?.total),
		};
	}
}
