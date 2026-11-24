import type { Request, Response } from 'express';
import { query } from 'express-validator';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import { singleChoice } from '../validator/single-choice.js';
import { LedgerIndexer } from '../../services/ledger/ledger-indexer.js';
import {
	AdminAnalyticsService,
	DEFAULT_TOP_LIMIT,
	JOURNEYS,
	MAX_PAGE_LIMIT,
	RANGES,
	SEGMENTS,
	DEFAULT_PAGE_LIMIT,
	JOURNEY_STEPS,
	STALLED_STEP_KEYS,
	MAX_CUSTOM_RANGE_DAYS,
	type WindowSpec,
	type Journey,
	type Range,
	type Segment,
} from '../../services/admin/admin-analytics.js';
import { AdminLedgerWritesService } from '../../services/admin/admin-ledger-writes.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';
import { paginationValidators } from './customers.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: unknown): boolean =>
	typeof value === 'string' &&
	DATE.test(value) &&
	!Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
	new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/**
 * The window of a staff analytics route (U-36): `range` (7, 30 or 90 days ending today, or `all` since the first
 * sign-up; default 30) or `from` and `to` together (UTC dates, both included, at most MAX_CUSTOM_RANGE_DAYS days).
 */
const rangeValidator = [
	query('range')
		.optional()
		.isIn([...RANGES.map(String), 'all'])
		.withMessage(`range must be one of: ${RANGES.join(', ')} (days) or all`)
		.bail(),
	query('from').optional().custom(isRealDate).withMessage('from must be a date, YYYY-MM-DD (UTC)').bail(),
	query('to').optional().custom(isRealDate).withMessage('to must be a date, YYYY-MM-DD (UTC)').bail(),
	query('from')
		.custom((_value, { req }) => {
			const { from, to, range } = (req.query ?? {}) as Record<string, string | undefined>;
			if (from === undefined && to === undefined) return true;
			if (from === undefined || to === undefined) throw new Error('from and to must be given together');
			if (range !== undefined) throw new Error('give either range or from and to, not both');
			const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
			if (days < 1) throw new Error('from must not be after to');
			if (days > MAX_CUSTOM_RANGE_DAYS) throw new Error(`from to to spans at most ${MAX_CUSTOM_RANGE_DAYS} days`);
			return true;
		})
		.bail(),
];
const segmentValidator = query('segment')
	.optional()
	.isIn([...SEGMENTS])
	.withMessage(`segment must be one of: ${SEGMENTS.join(', ')}`)
	.bail();

const rangeOf = (request: Request): Range => Number(request.query.range ?? 30) as Range;
const windowOf = (request: Request): WindowSpec => {
	const { from, to, range } = request.query as Record<string, string | undefined>;
	if (from !== undefined && to !== undefined) return { from, to };
	if (range === 'all') return 'all';
	return Number(range ?? 30) as Range;
};
const segmentOf = (request: Request): Segment => (request.query.segment ?? 'all') as Segment;

/**
 * Staff analytics over Studio's own tables, counts only. Segment rule (proposal): `agents` = the customer has at
 * least one non-deleted agent; `people` = no agents but it has issued a credential; `unclassified` otherwise;
 * `all` applies no segment filter. Needs the `admin:analytics:read` scope on every route.
 */
export class AnalyticsAdminController {
	constructor(
		private readonly service: () => AdminAnalyticsService = () => AdminAnalyticsService.instance,
		private readonly ledgerWrites: () => AdminLedgerWritesService = () => AdminLedgerWritesService.instance
	) {}

	public static overviewValidator = [...rangeValidator, segmentValidator];
	public static endpointsValidator = [...rangeValidator, segmentValidator];
	public static topAccountsValidator = [
		...rangeValidator,
		segmentValidator,
		query('limit')
			.optional()
			.isInt({ min: 1, max: MAX_PAGE_LIMIT })
			.withMessage(`limit must be 1 to ${MAX_PAGE_LIMIT}`)
			.bail(),
	];
	public static faucetToLedgerValidator = [...rangeValidator, segmentValidator];
	public static ledgerWritesValidator = [singleChoice('range', RANGES, '30')];
	private static journeyValidators = [
		query('journey')
			.exists()
			.withMessage('journey is required')
			.bail()
			.isIn([...JOURNEYS])
			.withMessage(`journey must be one of: ${JOURNEYS.join(', ')}`)
			.bail(),
		...rangeValidator,
		segmentValidator,
	];
	public static funnelsValidator = [
		...AnalyticsAdminController.journeyValidators,
		query('cohort').optional().isIn(['week']).withMessage('cohort must be week').bail(),
	];

	public static stalledValidator = [
		...AnalyticsAdminController.journeyValidators,
		query('step')
			.exists()
			.withMessage('step is required')
			.bail()
			.isIn(STALLED_STEP_KEYS)
			.withMessage(`step must be one of: ${STALLED_STEP_KEYS.join(', ')}`)
			.bail()
			.custom((step, { req }) => {
				const steps = JOURNEY_STEPS[req.query?.journey as Journey] ?? [];
				return steps.slice(1).some((s) => s.key === step);
			})
			.withMessage('step is not a step of this journey after the first')
			.bail(),
		...paginationValidators,
	];

	private async run(response: Response, work: () => Promise<unknown>) {
		if (!requireStaffScope(response, STAFF_SCOPES.analyticsRead)) return response;
		try {
			return response.status(StatusCodes.OK).json(await work());
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/overview:
	 *   get:
	 *     summary: Usage overview (staff only).
	 *     description: >-
	 *       Tiles and per-day series over the last 7, 30 or 90 whole UTC days (including today). `segment` is `agents`
	 *       (has at least one non-deleted agent), `people` (no agents, has issued a credential), `unclassified`
	 *       (neither) or `all`. `apiCalls` counts tracked operations; `testCheqSent` is testnet CHEQ from completed
	 *       faucet requests. Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - $ref: '#/components/parameters/AnalyticsRange'
	 *       - $ref: '#/components/parameters/AnalyticsFrom'
	 *       - $ref: '#/components/parameters/AnalyticsTo'
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 tiles:
	 *                   type: object
	 *                   properties:
	 *                     signUps: { type: integer }
	 *                     activeAccounts: { type: integer }
	 *                     registeredAnAgent: { type: integer }
	 *                     issuedACredential: { type: integer }
	 *                     apiCalls: { type: integer }
	 *                     testCheqSent: { type: number }
	 *                 series:
	 *                   type: object
	 *                   properties:
	 *                     signUpsPerDay:
	 *                       type: array
	 *                       items:
	 *                         $ref: '#/components/schemas/AdminDayCount'
	 *                     apiCallsPerDay:
	 *                       type: array
	 *                       items:
	 *                         $ref: '#/components/schemas/AdminDayCount'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async overview(request: Request, response: Response) {
		return this.run(response, () => this.service().overview(windowOf(request), segmentOf(request)));
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/endpoints:
	 *   get:
	 *     summary: Calls by endpoint (staff only).
	 *     description: >-
	 *       Tracked operations grouped by operation, most called first (at most 100). Studio records an `operation`
	 *       row for the operations it meters, not for every HTTP request. A call failed when it was unsuccessful or its
	 *       `outcome` was `error`; `errorRate` is the failed share from 0 to 1. `avgMs` is 0 when no duration was
	 *       recorded. An operation with no known route is returned with its name as `route` and an empty `method`.
	 *       Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - $ref: '#/components/parameters/AnalyticsRange'
	 *       - $ref: '#/components/parameters/AnalyticsFrom'
	 *       - $ref: '#/components/parameters/AnalyticsTo'
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: object
	 *                 properties:
	 *                   route: { type: string, example: /did/create }
	 *                   method: { type: string, example: POST }
	 *                   calls: { type: integer }
	 *                   errorRate: { type: number }
	 *                   avgMs: { type: number }
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async endpoints(request: Request, response: Response) {
		return this.run(response, () => this.service().endpoints(windowOf(request), segmentOf(request)));
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/top-accounts:
	 *   get:
	 *     summary: Top accounts by calls (staff only).
	 *     description: Customers with the most tracked operations in the range. Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - $ref: '#/components/parameters/AnalyticsRange'
	 *       - $ref: '#/components/parameters/AnalyticsFrom'
	 *       - $ref: '#/components/parameters/AnalyticsTo'
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: object
	 *                 properties:
	 *                   customerId: { type: string, format: uuid }
	 *                   name: { type: string }
	 *                   plan: { type: string }
	 *                   calls: { type: integer }
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async topAccounts(request: Request, response: Response) {
		const limit = Number(request.query.limit ?? DEFAULT_TOP_LIMIT);
		return this.run(response, () => this.service().topAccounts(windowOf(request), segmentOf(request), limit));
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/plan-mix:
	 *   get:
	 *     summary: Plan mix (staff only).
	 *     description: >-
	 *       Accounts per plan, and the percentage on a paid plan (plans named in `PAID_PLAN_NAMES`, default `build`).
	 *       Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 plans:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       plan: { type: string }
	 *                       accounts: { type: integer }
	 *                 paidPercent: { type: number, description: 'Share of accounts on a paid plan, 0 to 100, one decimal place.' }
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async planMix(_request: Request, response: Response) {
		return this.run(response, () => this.service().planMix());
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/funnels:
	 *   get:
	 *     summary: Journey funnel (staff only).
	 *     description: >-
	 *       Steps for the customers who signed up in the window (`range`, or `from` and `to`). A customer counts at a step only if it reached all the
	 *       steps before it. `first-credential`: signed up, first API key (any API key, revoked or not, including the
	 *       portal session key), first API call (first tracked operation), funded address (completed faucet request),
	 *       first DID, first credential issued. `first-agent`: signed up, first API key, first API call, funded
	 *       address, first DID, registered an agent, agent card
	 *       signed. `medianSecondsFromPrevious` is null for the first step or when nobody reached the step. Percent and
	 *       drop are for the client to work out from `accounts`. Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - in: query
	 *         name: journey
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum: [first-credential, first-agent]
	 *       - $ref: '#/components/parameters/AnalyticsRange'
	 *       - $ref: '#/components/parameters/AnalyticsFrom'
	 *       - $ref: '#/components/parameters/AnalyticsTo'
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *       - in: query
	 *         name: cohort
	 *         description: >-
	 *           `week` adds `cohorts`: the same steps per calendar week of sign-up (UTC, weeks start on Monday), oldest
	 *           first, for weeks with at least one sign-up in the window.
	 *         schema:
	 *           type: string
	 *           enum: [week]
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 journey: { type: string }
	 *                 range: { description: 'The days of a preset window (7, 30 or 90, a number), or all, or custom.', example: 30 }
	 *                 from: { type: string, format: date, nullable: true, description: 'Null for range=all.' }
	 *                 to: { type: string, format: date }
	 *                 steps:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/AdminFunnelStep'
	 *                 cohort: { type: string, enum: [week], description: 'Only with cohort=week.' }
	 *                 cohorts:
	 *                   type: array
	 *                   description: Only with cohort=week.
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       weekStart: { type: string, format: date, example: '2026-11-16' }
	 *                       steps:
	 *                         type: array
	 *                         items:
	 *                           $ref: '#/components/schemas/AdminFunnelStep'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async funnels(request: Request, response: Response) {
		const journey = request.query.journey as Journey;
		const cohort = request.query.cohort === 'week' ? ('week' as const) : undefined;
		return this.run(response, () =>
			cohort
				? this.service().funnel(journey, windowOf(request), segmentOf(request), cohort)
				: this.service().funnel(journey, windowOf(request), segmentOf(request))
		);
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/funnels/stalled:
	 *   get:
	 *     summary: Accounts that stalled before a funnel step (staff only).
	 *     description: >-
	 *       The accounts of the funnel cohort (signed up in the range, in the segment) that reached the step before
	 *       `step` but not `step` itself, newest sign-up first. For any step, `total` is the previous step's `accounts`
	 *       minus this step's `accounts` in `/admin/analytics/funnels` for the same journey, range and segment.
	 *       Anonymised: each account is `ref` (a short opaque reference, stable across pages and calls, that is not the
	 *       customer id), `signedUpAt` and `lastActiveAt` (last tracked operation, or null). No id, name or email.
	 *       Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - in: query
	 *         name: journey
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum: [first-credential, first-agent]
	 *       - in: query
	 *         name: step
	 *         required: true
	 *         description: >-
	 *           A step key of the journey other than the first. `first-credential`: first-api-key, first-api-call,
	 *           funded, first-did, first-credential. `first-agent`: first-api-key, first-api-call, funded, first-did,
	 *           registered-agent, card-signed.
	 *         schema:
	 *           type: string
	 *           enum: [first-api-key, first-api-call, funded, first-did, first-credential, registered-agent, card-signed]
	 *       - $ref: '#/components/parameters/AnalyticsRange'
	 *       - $ref: '#/components/parameters/AnalyticsFrom'
	 *       - $ref: '#/components/parameters/AnalyticsTo'
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 25
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AdminStalledAccounts'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async stalled(request: Request, response: Response) {
		const journey = request.query.journey as Journey;
		const step = request.query.step as string;
		return this.run(response, () =>
			this.service().stalledAccounts(
				journey,
				step,
				windowOf(request),
				segmentOf(request),
				Number(request.query.page ?? 1),
				Number(request.query.limit ?? DEFAULT_PAGE_LIMIT)
			)
		);
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/faucet-to-ledger:
	 *   get:
	 *     summary: Faucet to ledger, from what Studio records (staff only).
	 *     description: >-
	 *       Funded addresses (first completed faucet request in the range) and what Studio can tell about them.
	 *       Studio only records faucet requests made by signed-in customers and only the ledger writes it makes itself,
	 *       so "wrote" means a tracked, successful testnet write operation by the customer after funding, counted for
	 *       addresses that are the customer's own Studio account. Elements that need the ledger itself (writes made
	 *       with an SDK, the 2 by 2 with Studio journeys) are `{ supported: false, reason }` and listed in
	 *       `unavailable`; they are not zero. Counts only. Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - $ref: '#/components/parameters/AnalyticsRange'
	 *       - $ref: '#/components/parameters/AnalyticsFrom'
	 *       - $ref: '#/components/parameters/AnalyticsTo'
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 range: { description: 'The days of a preset window (7, 30 or 90, a number), or all, or custom.', example: 30 }
	 *                 segment: { type: string }
	 *                 from: { type: string, nullable: true, example: '2026-10-17', description: 'Null for range=all.' }
	 *                 to: { type: string, example: '2026-11-15' }
	 *                 network: { type: string, enum: [testnet] }
	 *                 tiles:
	 *                   type: object
	 *                   description: 'Each tile is { supported: true, value } or { supported: false, reason }.'
	 *                   additionalProperties: { type: object }
	 *                 funnel:
	 *                   type: object
	 *                   description: '`{ supported: true, rows: [{ key, label, addresses, basis }] }`. `basis` is `all-funded` or `own-account`.'
	 *                 ledgerFunnel: { type: object, description: 'Unsupported: needs a ledger indexer.' }
	 *                 writeKinds: { type: object, description: '`{ supported: true, rows: [{ key, label, addresses }] }`.' }
	 *                 timeToFirstWrite: { type: object, description: '`{ supported: true, rows: [{ key, label, addresses }] }`.' }
	 *                 ledgerVsStudioJourneys: { type: object, description: 'Unsupported: needs a ledger indexer.' }
	 *                 unavailable:
	 *                   type: array
	 *                   items: { type: string }
	 *                 notes:
	 *                   type: array
	 *                   items: { type: string }
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async faucetToLedger(request: Request, response: Response) {
		LedgerIndexer.instance.maybeRun();
		return this.run(response, () => this.service().faucetToLedger(windowOf(request), segmentOf(request)));
	}

	/**
	 * @openapi
	 *
	 * /admin/analytics/ledger-writes:
	 *   get:
	 *     summary: On-ledger writes of the faucet-funded addresses (staff only).
	 *     description: >-
	 *       Writes by type and day (zero-filled), retention (the share of addresses that wrote and were still writing 1,
	 *       2 and 4 weeks after their first write: week buckets after the first write day, UTC), the fees paid by
	 *       operation type split into Studio payer accounts and other (SDK) addresses, and the share of writes made
	 *       through Studio. Testnet. Fees are exact (the fee recorded on each transaction); failed transactions are
	 *       not included. Needs the ledger indexer (`LEDGER_INDEXER_ENABLED`) to have stored per-day writes for at
	 *       least `LEDGER_INDEXER_MIN_COVERAGE_PERCENT` of the funded addresses; otherwise every section is
	 *       `{ supported: false, reason }`. Counts and fees only. Needs the `admin:analytics:read` scope.
	 *     tags: [Analytics]
	 *     parameters:
	 *       - in: query
	 *         name: range
	 *         schema: { type: integer, enum: [7, 30, 90], default: 30 }
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 range: { type: integer, enum: [7, 30, 90] }
	 *                 from: { type: string }
	 *                 to: { type: string }
	 *                 network: { type: string, enum: [testnet] }
	 *                 coverage:
	 *                   type: object
	 *                   properties:
	 *                     fundedAddresses: { type: integer }
	 *                     coveredAddresses: { type: integer }
	 *                     percent: { type: number }
	 *                     minimumPercent: { type: number }
	 *                 writes: { type: object, description: '`{ supported: true, days, totals }` or unsupported.' }
	 *                 retention: { type: object, description: '`{ supported: true, definition, cohort, weeks }` or unsupported.' }
	 *                 fees: { type: object, description: '`{ supported: true, basis, denom, byOperation, totals }` or unsupported.' }
	 *                 channels: { type: object, description: '`{ supported: true, studioWrites, otherWrites, studioShare, writingAddresses }` or unsupported.' }
	 *                 notes:
	 *                   type: array
	 *                   items: { type: string }
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async ledgerWritesReport(request: Request, response: Response) {
		LedgerIndexer.instance.maybeRun();
		return this.run(response, () => this.ledgerWrites().ledgerWrites(rangeOf(request)));
	}
}
