import type { Request, Response } from 'express';
import { query } from 'express-validator';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import {
	AdminAnalyticsService,
	DEFAULT_TOP_LIMIT,
	JOURNEYS,
	MAX_PAGE_LIMIT,
	RANGES,
	SEGMENTS,
	type Journey,
	type Range,
	type Segment,
} from '../../services/admin/admin-analytics.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';

const rangeValidator = query('range')
	.optional()
	.isIn(RANGES.map(String))
	.withMessage(`range must be one of: ${RANGES.join(', ')} (days)`)
	.bail();
const segmentValidator = query('segment')
	.optional()
	.isIn([...SEGMENTS])
	.withMessage(`segment must be one of: ${SEGMENTS.join(', ')}`)
	.bail();

const rangeOf = (request: Request): Range => Number(request.query.range ?? 30) as Range;
const segmentOf = (request: Request): Segment => (request.query.segment ?? 'all') as Segment;

/**
 * Staff analytics over Studio's own tables, counts only. Segment rule (proposal): `agents` = the customer has at
 * least one non-deleted agent; `people` = no agents but it has issued a credential; `unclassified` otherwise;
 * `all` applies no segment filter. Needs the `admin:analytics:read` scope on every route.
 */
export class AnalyticsAdminController {
	constructor(private readonly service: () => AdminAnalyticsService = () => AdminAnalyticsService.instance) {}

	public static overviewValidator = [rangeValidator, segmentValidator];
	public static endpointsValidator = [rangeValidator, segmentValidator];
	public static topAccountsValidator = [
		rangeValidator,
		segmentValidator,
		query('limit')
			.optional()
			.isInt({ min: 1, max: MAX_PAGE_LIMIT })
			.withMessage(`limit must be 1 to ${MAX_PAGE_LIMIT}`)
			.bail(),
	];
	public static funnelsValidator = [
		query('journey')
			.exists()
			.withMessage('journey is required')
			.bail()
			.isIn([...JOURNEYS])
			.withMessage(`journey must be one of: ${JOURNEYS.join(', ')}`)
			.bail(),
		rangeValidator,
		segmentValidator,
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
		return this.run(response, () => this.service().overview(rangeOf(request), segmentOf(request)));
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
		return this.run(response, () => this.service().endpoints(rangeOf(request), segmentOf(request)));
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
		return this.run(response, () => this.service().topAccounts(rangeOf(request), segmentOf(request), limit));
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
	 *       Steps for the customers who signed up in the range. A customer counts at a step only if it reached all the
	 *       steps before it. `first-credential`: signed up, funded address (completed faucet request), first DID, first
	 *       credential issued. `first-agent`: signed up, funded address, first DID, registered an agent, agent card
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
	 *       - $ref: '#/components/parameters/AnalyticsSegment'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 journey: { type: string }
	 *                 steps:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       key: { type: string }
	 *                       label: { type: string }
	 *                       accounts: { type: integer }
	 *                       medianSecondsFromPrevious: { type: integer, nullable: true }
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
		return this.run(response, () => this.service().funnel(journey, rangeOf(request), segmentOf(request)));
	}
}
