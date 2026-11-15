import type { Request, Response } from 'express';
import { query } from 'express-validator';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import {
	CUSTOMER_RANGES,
	CustomerAnalyticsService,
	type CustomerAnalytics,
	type CustomerRange,
} from '../../services/analytics/customer-analytics.js';

const rangeValidator = query('range')
	.optional()
	.isIn(CUSTOMER_RANGES.map(String))
	.withMessage(`range must be one of: ${CUSTOMER_RANGES.join(', ')} (days)`)
	.bail();

/**
 * Analytics for the signed-in customer, for the portal's Analytics page. The customer is always the authenticated
 * one (`response.locals.customer`); no parameter can name another. Counts only. Elements Studio cannot measure are
 * returned as `{ supported: false, reason }`, never as zero. Needs the `read:account` scope.
 */
export class CustomerAnalyticsController {
	constructor(private readonly service: () => CustomerAnalyticsService = () => CustomerAnalyticsService.instance) {}

	public static analyticsValidator = [rangeValidator];

	private async run(
		request: Request,
		response: Response,
		work: (customerId: string, range: CustomerRange) => Promise<CustomerAnalytics>
	) {
		const customerId = response.locals.customer?.customerId as string | undefined;
		if (!customerId) {
			return response.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized Error' });
		}
		try {
			const range = Number(request.query.range ?? 30) as CustomerRange;
			return response.status(StatusCodes.OK).json(await work(customerId, range));
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}

	/**
	 * @openapi
	 *
	 * /account/analytics/agents:
	 *   get:
	 *     tags: [Account]
	 *     summary: Analytics for your agents.
	 *     description: >-
	 *       Tiles, a per-day series and tables for the Agents tab, over the last 7 or 30 whole UTC days (including
	 *       today), for the signed-in customer only. Counts only. Studio does not record verifications of agents, so
	 *       the verification tiles, series and tables are returned as `{ supported: false, reason }` and listed in
	 *       `unavailable`; they are not zero. What is supported is agent activity: agents registered, authority
	 *       granted and revoked, and the activity feed per day and per agent.
	 *     parameters:
	 *       - in: query
	 *         name: range
	 *         description: Days to look back, counting today as a whole UTC day.
	 *         schema:
	 *           type: integer
	 *           enum: [7, 30]
	 *           default: 30
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CustomerAnalyticsResponse'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async agents(request: Request, response: Response) {
		return this.run(request, response, (customerId, range) => this.service().agents(customerId, range));
	}

	/**
	 * @openapi
	 *
	 * /account/analytics/individuals:
	 *   get:
	 *     tags: [Account]
	 *     summary: Analytics for credentials you issue to individuals.
	 *     description: >-
	 *       Tiles (credentials issued, presentations verified, revoked, status checks), credentials issued per day and
	 *       a by-format table for the Individuals tab, over the last 7 or 30 whole UTC days (including today), for the
	 *       signed-in customer only. Counts only, never credential contents. Partner hand-offs are not recorded and
	 *       are returned as `{ supported: false, reason }`.
	 *     parameters:
	 *       - in: query
	 *         name: range
	 *         description: Days to look back, counting today as a whole UTC day.
	 *         schema:
	 *           type: integer
	 *           enum: [7, 30]
	 *           default: 30
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CustomerAnalyticsResponse'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async individuals(request: Request, response: Response) {
		return this.run(request, response, (customerId, range) => this.service().individuals(customerId, range));
	}
}
