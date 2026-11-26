import { createHash } from 'node:crypto';
import { Connection } from '../../database/connection/connection.js';
import type { Table, Tile, Unsupported } from '../analytics/customer-analytics.js';
import { ledgerIndexerConfig } from '../ledger/ledger-indexer.js';
import { maskEmail, maskIfEmail } from './mask-email.js';

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
export const JOURNEYS = ['first-credential', 'first-agent', 'first-api-call'] as const;
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
	/** Masked when the name is itself an email address. */
	name: string;
	/** Always masked (`a•••@example.com`); the full address only comes from the audited email reveal. */
	email: string;
	plan: string;
	network: 'mainnet' | 'testnet';
	createdAt: string;
	lastActiveAt: string | null;
	status: 'active' | 'inactive';
	usage: CustomerUsage;
}
/**
 * When the customer first reached each milestone (ISO 8601), or null if it has not yet (U-35). Dates from before a
 * milestone was recorded come from a backfill over existing data (see the `customerActivation` migrations).
 */
export interface CustomerMilestones {
	/** First DID created (through the API, or for an agent). */
	firstIdentifierAt: string | null;
	firstAgentAt: string | null;
	/** First API key the customer created itself; portal session keys do not count. */
	firstApiKeyAt: string | null;
	firstCredentialIssuedAt: string | null;
	firstStatusListAt: string | null;
	/** First faucet request that credited the account. */
	firstFaucetRequestAt: string | null;
	/** First tracked operation of any kind. */
	firstApiCallAt: string | null;
}
export interface CustomerDetail extends CustomerSummary {
	paymentPlan: string;
	agentCount: number;
	segment: Exclude<Segment, 'all'>;
	milestones: CustomerMilestones;
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

/**
 * Window: whole UTC days, so the per-day series and the totals agree. `$1` is a text array `[start, stop]` of ISO
 * instants from `analyticsWindow`: rows count when `start <= t < stop`. A null start (`range=all`) means from the UTC
 * day of the first sign-up. `start_day` and `end_day` are the first and last UTC days, for the per-day series.
 */
const WINDOW_CTE = `win AS (
	SELECT w.start, w.stop, w.start AT TIME ZONE 'UTC' AS start_day, (w.stop AT TIME ZONE 'UTC') - interval '1 day' AS end_day
	FROM (
		SELECT COALESCE(
				($1::text[])[1]::timestamptz,
				(SELECT date_trunc('day', MIN(c0."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM "customer" c0),
				date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
			) AS start,
			($1::text[])[2]::timestamptz AS stop
	) w
)`;

/** Longest custom `from`/`to` span, in days (both ends included). */
export const MAX_CUSTOM_RANGE_DAYS = 400;

/** What a staff analytics route was asked for: a preset number of days, every day since the first sign-up, or dates. */
export type WindowSpec = Range | 'all' | { from: string; to: string };

/** A resolved window. `from` and `to` are UTC dates (`to` included); `from` is null for `all` (first sign-up). */
export interface AnalyticsWindow {
	range: Range | 'all' | 'custom';
	from: string | null;
	to: string;
	/** `$1` of every windowed statement: `[start ISO or null, stop ISO]`, stop exclusive. */
	parameter: [string | null, string];
}

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Resolves a window spec against today (UTC). Presets end today, inclusive, as before. */
export function analyticsWindow(spec: WindowSpec, now: Date = new Date()): AnalyticsWindow {
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	if (typeof spec === 'object') {
		const from = Date.parse(`${spec.from}T00:00:00Z`);
		const stop = Date.parse(`${spec.to}T00:00:00Z`) + DAY_MS;
		return {
			range: 'custom',
			from: spec.from,
			to: spec.to,
			parameter: [new Date(from).toISOString(), new Date(stop).toISOString()],
		};
	}
	const stop = today + DAY_MS;
	if (spec === 'all') {
		return { range: 'all', from: null, to: isoDay(today), parameter: [null, new Date(stop).toISOString()] };
	}
	const start = today - (spec - 1) * DAY_MS;
	return {
		range: spec,
		from: isoDay(start),
		to: isoDay(today),
		parameter: [new Date(start).toISOString(), new Date(stop).toISOString()],
	};
}

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

interface JourneyStep {
	key: string;
	label: string;
	/** Column of the `j` row (see JOURNEY_CTES) holding the time the step was reached. */
	column: string;
}

/** The steps of each journey, in order. Step keys are part of the API (`step` of the stalled-accounts route). */
export const JOURNEY_STEPS: Record<Journey, readonly JourneyStep[]> = {
	'first-credential': [
		{ key: 'signed-up', label: 'Signed up', column: 'j.signed' },
		{ key: 'funded', label: 'Funded address', column: 'j.funded' },
		{ key: 'first-did', label: 'First DID created', column: 'j.did' },
		{ key: 'first-credential', label: 'First credential issued', column: 'j.credential' },
	],
	'first-agent': [
		{ key: 'signed-up', label: 'Signed up', column: 'j.signed' },
		{ key: 'funded', label: 'Funded address', column: 'j.funded' },
		{ key: 'first-did', label: 'First DID created', column: 'j.did' },
		{ key: 'registered-agent', label: 'Registered an agent', column: 'j.agent' },
		{ key: 'card-signed', label: 'Agent card signed', column: 'j.card' },
	],
	// Studio API adoption, apart from the ledger journeys: SDK users may never call the Studio API (U-34)
	'first-api-call': [
		{ key: 'signed-up', label: 'Signed up', column: 'j.signed' },
		{ key: 'first-api-key', label: 'First API key', column: 'j.apikey' },
		{ key: 'first-api-call', label: 'First API call', column: 'j.apicall' },
	],
};

const journeySteps = (journey: Journey): readonly JourneyStep[] => JOURNEY_STEPS[journey];

/** Every step key that can be asked for as a stalled step (any journey, not the first step). */
export const STALLED_STEP_KEYS = [
	...new Set(Object.values(JOURNEY_STEPS).flatMap((steps) => steps.slice(1).map((s) => s.key))),
];

/** SQL condition: steps 0..i all reached. */
const reachedCondition = (steps: readonly JourneyStep[], i: number): string =>
	steps
		.slice(0, i + 1)
		.map((s) => `${s.column} IS NOT NULL`)
		.join(' AND ');

/**
 * One row `j` per customer of the funnel cohort (signed up in the range `$1`, in the segment `$2`) with the time it
 * reached each step, or null.
 */
const JOURNEY_CTES = `${WINDOW_CTE}, ${SEGMENT_CTE},
	cohort AS (
		SELECT c."customerId", c."createdAt" AS signed FROM "customer" c, win
		WHERE c."createdAt" >= win.start AND c."createdAt" < win.stop AND ${segmentFilter('c."customerId"')}
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
		SELECT cohort."customerId", cohort.signed, ca."firstApiKeyCreatedAt" AS apikey, ca."firstApiCallAt" AS apicall,
			funded.at AS funded, ca."firstDidCreatedAt" AS did,
			ca."firstCredentialIssuedAt" AS credential, ca."firstAgentRegisteredAt" AS agent, cards.at AS card
		FROM cohort
		LEFT JOIN funded ON funded."customerId" = cohort."customerId"
		LEFT JOIN "customerActivation" ca ON ca."customerId" = cohort."customerId"
		LEFT JOIN cards ON cards."customerId" = cohort."customerId"
	)`;

/**
 * A short reference for an account in an anonymised list: the first 12 hex characters of a SHA-256 of the customer
 * id under a fixed label. Stable, so the same account has the same reference on every page and call. It does not
 * contain the id and cannot be turned back into it; only someone who already holds the id can match the two.
 */
export function opaqueAccountRef(customerId: string): string {
	return `acct_${createHash('sha256').update(`studio:stalled-account:${customerId}`).digest('hex').slice(0, 12)}`;
}

/** Optional filters of the staff audit log (U-43). Dates are UTC days, YYYY-MM-DD, both included. */
export interface AuditLogFilter {
	action?: string;
	actor?: string;
	targetCustomerId?: string;
	q?: string;
	from?: string;
	to?: string;
}

export interface FunnelStep {
	key: string;
	label: string;
	accounts: number;
	medianSecondsFromPrevious: number | null;
}

export interface StalledAccount {
	/** Opaque, stable reference; not the customer id. */
	ref: string;
	signedUpAt: string;
	/** Last tracked operation, or null if none. */
	lastActiveAt: string | null;
}
export interface StalledAccounts {
	journey: Journey;
	step: string;
	stepLabel: string;
	previousStep: string;
	previousStepLabel: string;
	range: AnalyticsWindow['range'];
	/** First UTC day of the window; null for `all` (from the first sign-up). */
	from: string | null;
	/** Last UTC day of the window, included. */
	to: string;
	segment: Segment;
	page: number;
	limit: number;
	/** Stalled accounts across all pages. */
	total: number;
	accounts: StalledAccount[];
}

export function routeForOperation(operationName: string): { route: string; method: string } {
	const known = OPERATION_ROUTES[operationName];
	return known ? { method: known[0], route: known[1] } : { method: '', route: operationName };
}

export class AdminAnalyticsService {
	public static instance = new AdminAnalyticsService();

	constructor(
		private readonly db: () => Queryable = () => Connection.instance.dbConnection,
		private readonly ledgerConfig: () => { enabled: boolean; minCoveragePercent: number } = () =>
			ledgerIndexerConfig()
	) {}

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
			name: maskIfEmail(row.name as string),
			email: maskEmail(row.email as string),
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
				(SELECT segment FROM seg WHERE seg."customerId" = one.id) AS segment,
				ca."firstDidCreatedAt" AS "mIdentifier", ca."firstAgentRegisteredAt" AS "mAgent",
				ca."firstApiKeyCreatedAt" AS "mApiKey", ca."firstCredentialIssuedAt" AS "mCredential",
				ca."firstStatusListCreatedAt" AS "mStatusList", ca."firstFaucetRequestAt" AS "mFaucet",
				ca."firstApiCallAt" AS "mApiCall"
			FROM one LEFT JOIN "customerActivation" ca ON ca."customerId" = one.id`,
			[customerId]
		);
		if (rows.length === 0) return null;
		const row = rows[0];
		return {
			...AdminAnalyticsService.toSummary(row),
			paymentPlan: row.paymentPlan as string,
			agentCount: num(row.agentCount),
			segment: row.segment as CustomerDetail['segment'],
			milestones: {
				firstIdentifierAt: iso(row.mIdentifier),
				firstAgentAt: iso(row.mAgent),
				firstApiKeyAt: iso(row.mApiKey),
				firstCredentialIssuedAt: iso(row.mCredential),
				firstStatusListAt: iso(row.mStatusList),
				firstFaucetRequestAt: iso(row.mFaucet),
				firstApiCallAt: iso(row.mApiCall),
			},
		};
	}

	/** The full email of one customer, or null when there is no such customer. Only the audited reveal uses it. */
	async getCustomerEmail(customerId: string): Promise<string | null> {
		const rows = await this.rows<{ email: string | null }>(
			`SELECT c."email" FROM "customer" c WHERE c."customerId" = $1::uuid`,
			[customerId]
		);
		return rows.length === 0 ? null : (rows[0].email ?? '');
	}

	/**
	 * Appends one row to `adminAuditLog` (the one write in this service). Callers pass the actor, the action and the
	 * target customer id only: never a customer's name or email.
	 */
	async recordStaffAction(entry: {
		actorUserId: string;
		action: string;
		targetCustomerId: string;
		reason: string;
		ticketRef?: string;
	}): Promise<void> {
		await this.db().query(
			`INSERT INTO "adminAuditLog" ("actorUserId", "action", "targetCustomerId", "reason", "ticketRef") VALUES ($1, $2, $3::uuid, $4, $5)`,
			[entry.actorUserId, entry.action, entry.targetCustomerId, entry.reason, entry.ticketRef ?? null]
		);
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

	async overview(window: WindowSpec, segment: Segment) {
		const w = analyticsWindow(window);
		const parameters = [w.parameter, segment];
		const [tileRows, signUps, calls] = await Promise.all([
			this.rows(
				`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
				SELECT
					(SELECT COUNT(*) FROM "customer" c, win WHERE c."createdAt" >= win.start AND c."createdAt" < win.stop AND ${segmentFilter('c."customerId"')}) AS "signUps",
					(SELECT COUNT(DISTINCT o."customerId") FROM "operation" o, win WHERE o."createdAt" >= win.start AND o."createdAt" < win.stop AND o."customerId" IS NOT NULL AND ${segmentFilter('o."customerId"')}) AS "activeAccounts",
					(SELECT COUNT(*) FROM "customerActivation" ca, win WHERE ca."firstAgentRegisteredAt" >= win.start AND ca."firstAgentRegisteredAt" < win.stop AND ${segmentFilter('ca."customerId"')}) AS "registeredAnAgent",
					(SELECT COUNT(*) FROM "customerActivation" ca, win WHERE ca."firstCredentialIssuedAt" >= win.start AND ca."firstCredentialIssuedAt" < win.stop AND ${segmentFilter('ca."customerId"')}) AS "issuedACredential",
					(SELECT COUNT(*) FROM "operation" o, win WHERE o."createdAt" >= win.start AND o."createdAt" < win.stop AND ${segmentFilter('o."customerId"')}) AS "apiCalls",
					(SELECT COALESCE(SUM(fr."amountNcheq"), 0) / 1000000000 FROM "faucetRequest" fr, win WHERE fr."createdAt" >= win.start AND fr."createdAt" < win.stop AND fr."status" = 'completed' AND ${segmentFilter('fr."customerId"')}) AS "testCheqSent"`,
				parameters
			),
			this.rows<{ date: string; count: string }>(
				`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
				SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COUNT(c."customerId") AS count
				FROM win CROSS JOIN generate_series(win.start_day, win.end_day, interval '1 day') AS d(day)
				LEFT JOIN "customer" c ON date_trunc('day', c."createdAt" AT TIME ZONE 'UTC') = d.day AND c."createdAt" >= win.start AND c."createdAt" < win.stop AND ${segmentFilter('c."customerId"')}
				GROUP BY d.day ORDER BY d.day`,
				parameters
			),
			this.rows<{ date: string; count: string }>(
				`WITH ${WINDOW_CTE}, ${SEGMENT_CTE},
				per_day AS (
					SELECT date_trunc('day', o."createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
					FROM "operation" o, win WHERE o."createdAt" >= win.start AND o."createdAt" < win.stop AND ${segmentFilter('o."customerId"')}
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
	async endpoints(window: WindowSpec, segment: Segment) {
		const w = analyticsWindow(window);
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
			SELECT o."operationName" AS name, COUNT(*) AS calls,
				COUNT(*) FILTER (WHERE NOT o."successful" OR o."outcome" = 'error') AS failed,
				AVG(o."durationMs") AS "avgMs"
			FROM "operation" o, win
			WHERE o."createdAt" >= win.start AND o."createdAt" < win.stop AND ${segmentFilter('o."customerId"')}
			GROUP BY o."operationName" ORDER BY calls DESC, name LIMIT 100`,
			[w.parameter, segment]
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

	async topAccounts(window: WindowSpec, segment: Segment, limit: number) {
		const w = analyticsWindow(window);
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE}
			SELECT c."customerId" AS "customerId", c."name", ${PLAN_EXPR} AS plan, COUNT(*) AS calls
			FROM "operation" o JOIN "customer" c ON c."customerId" = o."customerId", win
			WHERE o."createdAt" >= win.start AND o."createdAt" < win.stop AND ${segmentFilter('o."customerId"')}
			GROUP BY c."customerId", c."name" ORDER BY calls DESC, c."customerId" LIMIT $3`,
			[w.parameter, segment, limit]
		);
		return rows.map((r) => ({
			customerId: r.customerId as string,
			name: maskIfEmail(r.name as string),
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
	 * Journey C (`first-api-call`): signed up, first API key, first API call. First API key is
	 * `customerActivation.firstApiKeyCreatedAt` (a key the customer created; portal session keys and Studio's own keys
	 * do not count); first API call is `customerActivation.firstApiCallAt` (the first tracked operation).
	 * The faucet table keeps a limited history (see FAUCET_REQUEST_RETENTION_MONTHS), so "funded" can undercount for
	 * old customers, which `range=all` and custom dates can now include.
	 * With `cohort = 'week'` the result also has `cohorts`: the same steps per calendar week of sign-up (UTC, weeks
	 * start on Monday), oldest first, for the weeks with at least one sign-up in the window.
	 */
	async funnel(journey: Journey, window: WindowSpec, segment: Segment, cohort?: 'week') {
		const w = analyticsWindow(window);
		const steps = journeySteps(journey);
		// Step i is reached when columns 0..i are all set; its gap is column i minus column i-1
		const selects = steps.map((step, i) => {
			const reached = reachedCondition(steps, i);
			const gap =
				i === 0
					? 'NULL::float'
					: `percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (${step.column} - ${steps[i - 1].column})))) FILTER (WHERE ${reached})`;
			return `COUNT(*) FILTER (WHERE ${reached}) AS "accounts${i}", ${gap} AS "gap${i}"`;
		});
		const shape = (row: Record<string, unknown>): FunnelStep[] =>
			steps.map((step, i) => ({
				key: step.key,
				label: step.label,
				accounts: num(row[`accounts${i}`]),
				medianSecondsFromPrevious:
					i === 0 || row[`gap${i}`] === null || row[`gap${i}`] === undefined
						? null
						: Math.round(num(row[`gap${i}`])),
			}));
		const [rows, weekRows] = await Promise.all([
			this.rows(`WITH ${JOURNEY_CTES} SELECT ${selects.join(', ')} FROM j`, [w.parameter, segment]),
			cohort === 'week'
				? this.rows(
						`WITH ${JOURNEY_CTES}
						SELECT to_char(date_trunc('week', j.signed AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "weekStart", ${selects.join(', ')}
						FROM j GROUP BY 1 ORDER BY 1`,
						[w.parameter, segment]
					)
				: Promise.resolve([]),
		]);
		return {
			journey,
			range: w.range,
			from: w.from,
			to: w.to,
			steps: shape(rows[0] ?? {}),
			...(cohort === 'week'
				? {
						cohort,
						cohorts: weekRows.map((r) => ({ weekStart: r.weekStart as string, steps: shape(r) })),
					}
				: {}),
		};
	}

	/**
	 * The accounts that stalled before a funnel step (U-40): in the same cohort as `funnel` (signed up in the range,
	 * in the segment), they reached every step before `step` but not `step` itself. So for each step but the first,
	 * `total` here equals the previous step's `accounts` minus this step's `accounts` in `funnel`.
	 *
	 * Anonymised: each account is a short opaque reference (a hash of the customer id, stable across calls and pages),
	 * its sign-up time and its last tracked operation. No id, name or email leaves this
	 * method. Newest sign-ups first. Returns null when `step` is not a step of the journey after the first.
	 */
	async stalledAccounts(
		journey: Journey,
		step: string,
		window: WindowSpec,
		segment: Segment,
		page: number,
		limit: number
	): Promise<StalledAccounts | null> {
		const steps = journeySteps(journey);
		const index = steps.findIndex((s) => s.key === step);
		if (index < 1) return null;
		const w = analyticsWindow(window);
		const stalled = `${reachedCondition(steps, index - 1)} AND ${steps[index].column} IS NULL`;
		const [pageRows, totalRows] = await Promise.all([
			this.rows(
				`WITH ${JOURNEY_CTES},
				page AS (SELECT j."customerId", j.signed FROM j WHERE ${stalled} ORDER BY j.signed DESC, j."customerId" LIMIT $3 OFFSET $4)
				SELECT page."customerId", page.signed AS "signedUpAt",
					(SELECT MAX(o."createdAt") FROM "operation" o WHERE o."customerId" = page."customerId") AS "lastActiveAt"
				FROM page ORDER BY page.signed DESC, page."customerId"`,
				[w.parameter, segment, limit, (page - 1) * limit]
			),
			this.rows<{ total: string }>(`WITH ${JOURNEY_CTES} SELECT COUNT(*) AS total FROM j WHERE ${stalled}`, [
				w.parameter,
				segment,
			]),
		]);
		return {
			journey,
			step: steps[index].key,
			stepLabel: steps[index].label,
			previousStep: steps[index - 1].key,
			previousStepLabel: steps[index - 1].label,
			range: w.range,
			from: w.from,
			to: w.to,
			segment,
			page,
			limit,
			total: num(totalRows[0]?.total),
			accounts: pageRows.map((r) => ({
				ref: opaqueAccountRef(r.customerId as string),
				signedUpAt: iso(r.signedUpAt) as string,
				lastActiveAt: iso(r.lastActiveAt),
			})),
		};
	}

	/**
	 * What the ledger indexer knows about the same cohort `faucetToLedger` counts. Returns `null` when the indexer is
	 * disabled, nobody is funded in the range, or too few of the funded addresses have been checked yet (a partial
	 * picture would read as a real one), so the caller keeps every ledger element unsupported, exactly as before.
	 */
	private async ledgerFigures(w: AnalyticsWindow, segment: Segment) {
		const config = this.ledgerConfig();
		if (!config.enabled) return null;
		const rows = await this.rows(
			`WITH ${WINDOW_CTE}, ${SEGMENT_CTE},
			first AS (
				SELECT DISTINCT ON (fr."address") fr."address" AS address, fr."customerId" AS "customerId", fr."createdAt" AS funded_at
				FROM "faucetRequest" fr WHERE fr."status" = 'completed'
				ORDER BY fr."address", fr."createdAt"
			),
			cohort AS (
				SELECT f.address, f."customerId", f.funded_at,
					a."writeCount" AS writes, a."firstWriteAt" AS first_write, a."didWriteCount" AS did,
					a."statusListWriteCount" AS lists, a."otherResourceWriteCount" AS other, (a."address" IS NOT NULL) AS checked,
					EXISTS (SELECT 1 FROM "agent" ag WHERE ag."customerId" = f."customerId") AS journey
				FROM first f
				JOIN win ON f.funded_at >= win.start AND f.funded_at < win.stop
				LEFT JOIN "ledgerAddressActivity" a ON a."address" = f.address
				WHERE ${segmentFilter('f."customerId"')}
			)
			SELECT COUNT(*) AS funded, COUNT(*) FILTER (WHERE checked) AS checked,
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND first_write <= funded_at + interval '7 days') AS "firstWrite7d",
				COUNT(*) FILTER (WHERE checked AND writes >= 2) AS "wroteAgain",
				COUNT(*) FILTER (WHERE checked AND writes = 0) AS "stillOff",
				COUNT(*) FILTER (WHERE checked AND did > 0) AS did,
				COUNT(*) FILTER (WHERE checked AND lists > 0) AS lists,
				COUNT(*) FILTER (WHERE checked AND other > 0) AS other,
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND GREATEST(first_write - funded_at, interval '0') < interval '1 hour') AS "withinHour",
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND GREATEST(first_write - funded_at, interval '0') >= interval '1 hour' AND first_write - funded_at < interval '1 day') AS "withinDay",
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND first_write - funded_at >= interval '1 day' AND first_write - funded_at < interval '7 days') AS "withinWeek",
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND first_write - funded_at >= interval '7 days' AND first_write - funded_at < interval '30 days') AS "withinMonth",
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND journey) AS "wroteJourney",
				COUNT(*) FILTER (WHERE checked AND writes > 0 AND NOT journey) AS "wroteNoJourney",
				COUNT(*) FILTER (WHERE checked AND writes = 0 AND journey) AS "noWriteJourney",
				COUNT(*) FILTER (WHERE checked AND writes = 0 AND NOT journey) AS "noWriteNoJourney"
			FROM cohort`,
			[w.parameter, segment]
		);
		const r = rows[0] ?? {};
		const funded = num(r.funded);
		const checked = num(r.checked);
		if (funded === 0 || checked === 0 || (checked / funded) * 100 < config.minCoveragePercent) {
			return { figures: null, funded, checked };
		}
		return { figures: r, funded, checked };
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
	async faucetToLedger(window: WindowSpec, segment: Segment) {
		const w = analyticsWindow(window);
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
				WHERE f.funded_at >= win.start AND f.funded_at < win.stop AND ${segmentFilter('f."customerId"')}
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
			[w.parameter, segment, FAUCET_WRITE_OPERATIONS, DID_WRITES, STATUS_LIST_WRITES, RESOURCE_WRITES]
		);
		const r = rows[0] ?? {};
		const indexed = await this.ledgerFigures(w, segment);
		const L = indexed?.figures ?? null;
		const ledger = (what: string): Unsupported => ({
			supported: false,
			reason: indexed
				? `${what} needs the ledger itself, and the ledger indexer has checked ${indexed.checked} of ${indexed.funded} funded addresses so far, too few to report. It fills in on its own.`
				: `${what} needs the ledger itself: Studio sees only the writes it makes for a customer, not writes made with an SDK or another tool. The ledger indexer is not switched on or has no data yet (decision A3).`,
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
			wroteToLedgerWithin7Days: L ? tile(L.firstWrite7d) : ledger('Writes to the ledger within 7 days'),
			stillOffLedger: L ? tile(L.stillOff) : ledger('Addresses still off the ledger'),
		};
		const studioFunnel = table([
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
		const funnel = L
			? table([
					{
						key: 'funded',
						label: 'Funded from the faucet',
						addresses: num(r.funded),
						basis: 'all-funded' as const,
					},
					{
						key: 'first-ledger-write-7d',
						label: 'First ledger write (within 7 days)',
						addresses: num(L.firstWrite7d),
						basis: 'all-funded' as const,
					},
					{
						key: 'wrote-again-ledger',
						label: 'Wrote again (2 or more writes)',
						addresses: num(L.wroteAgain),
						basis: 'all-funded' as const,
					},
					{
						key: 'topped-up',
						label: 'Came back for another top-up',
						addresses: num(r.toppedUp),
						basis: 'all-funded' as const,
					},
				])
			: studioFunnel;
		const kinds = L ?? r;
		const writeKinds = table([
			{ key: 'did', label: 'DID created or updated', addresses: num(kinds.did) },
			{ key: 'status-list', label: 'Status list or revocation update', addresses: num(kinds.lists) },
			{ key: 'other-resource', label: 'Other linked resources', addresses: num(kinds.other) },
		]);
		const timing = L ?? r;
		const timeToFirstWrite = table([
			{ key: 'within-hour', label: 'Within the hour', addresses: num(timing.withinHour) },
			{ key: 'within-day', label: 'Within a day', addresses: num(timing.withinDay) },
			{ key: 'within-week', label: 'Within a week', addresses: num(timing.withinWeek) },
			{ key: 'within-month', label: 'Within a month', addresses: num(timing.withinMonth) },
		]);
		const ledgerFunnel = L ? table((funnel as { rows: unknown[] }).rows) : ledger('The faucet to ledger funnel');
		const ledgerVsStudioJourneys = L
			? table([
					{
						key: 'wrote',
						label: 'Wrote to the ledger',
						usedStudioJourney: num(L.wroteJourney),
						noStudioJourney: num(L.wroteNoJourney),
					},
					{
						key: 'no-writes',
						label: 'No ledger writes',
						usedStudioJourney: num(L.noWriteJourney),
						noStudioJourney: num(L.noWriteNoJourney),
					},
				])
			: ledger('The ledger writes and Studio journeys table');
		const unavailable = [
			...Object.entries(tiles)
				.filter(([, item]) => !item.supported)
				.map(([key]) => `tiles.${key}`),
			...(L ? [] : ['ledgerFunnel', 'ledgerVsStudioJourneys']),
		];
		return {
			range: w.range,
			segment,
			from: w.from,
			to: w.to,
			network: 'testnet' as const,
			tiles,
			funnel,
			ledgerFunnel,
			writeKinds,
			timeToFirstWrite,
			ledgerVsStudioJourneys,
			unavailable,
			ledgerIndexer: {
				enabled: indexed !== null,
				fundedAddresses: indexed?.funded ?? 0,
				checkedAddresses: indexed?.checked ?? 0,
				supported: L !== null,
			},
			notes: L
				? [
						'Ledger figures come from the ledger indexer, which reads DID and resource writes (not other transaction types) whose fee payer is the funded address, on testnet. Failed writes are not counted.',
						`The indexer has checked ${indexed?.checked ?? 0} of ${indexed?.funded ?? 0} funded addresses in this range; the ledger figures cover the checked ones. Addresses with more writes than one check reads show exact totals and times but a lower-bound split by kind.`,
						'A Studio journey means the account has registered an agent. Granting authority needs an agent, so it is included; verifying an agent and partner hand-offs are not recorded.',
						'Cohorts are cut short by today, so the 7-day and later buckets are incomplete for recent funding. The faucet table keeps a limited history.',
					]
				: [
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
	 *
	 * Filters (U-43), all optional and combined with AND: `action` (exact), `actor` (the actor id, or the staff email,
	 * case-insensitive), `targetCustomerId` (exact), `q` (case-insensitive substring of the reason or the ticket
	 * reference), `from` and `to` (UTC dates, both included). Every value is a bound parameter.
	 */
	async auditLog(page: number, limit: number, filter: AuditLogFilter = {}) {
		const clauses: string[] = [];
		const parameters: unknown[] = [];
		const bind = (value: unknown) => {
			parameters.push(value);
			return `$${parameters.length}`;
		};
		if (filter.action) clauses.push(`a."action" = ${bind(filter.action)}`);
		if (filter.actor) {
			const actor = bind(filter.actor);
			clauses.push(`(a."actorUserId" = ${actor} OR lower(sc."email") = lower(${actor}))`);
		}
		if (filter.targetCustomerId) clauses.push(`a."targetCustomerId" = ${bind(filter.targetCustomerId)}::uuid`);
		if (filter.q) {
			const like = bind(`%${filter.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
			clauses.push(`(a."reason" ILIKE ${like} OR a."ticketRef" ILIKE ${like})`);
		}
		if (filter.from) clauses.push(`a."createdAt" >= ${bind(`${filter.from}T00:00:00Z`)}::timestamptz`);
		if (filter.to) {
			clauses.push(`a."createdAt" < (${bind(`${filter.to}T00:00:00Z`)}::timestamptz + interval '1 day')`);
		}
		const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
		const source = `FROM "adminAuditLog" a
				LEFT JOIN "user" su ON su."logToId" = a."actorUserId"
				LEFT JOIN "customer" sc ON sc."customerId" = su."customerId"
				${where}`;
		const filterParameters = [...parameters];
		const [entries, total] = await Promise.all([
			this.rows(
				`SELECT a."id", a."createdAt" AS "when", COALESCE(sc."email", a."actorUserId") AS staff, a."action",
					a."targetCustomerId" AS target, a."reason", a."ticketRef"
				${source}
				ORDER BY a."createdAt" DESC, a."id" LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`,
				parameters
			),
			this.rows<{ total: string }>(`SELECT COUNT(*) AS total ${source}`, filterParameters),
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
