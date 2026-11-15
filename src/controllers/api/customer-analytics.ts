import type { Request, Response } from 'express';
import { query } from 'express-validator';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import { singleChoice } from '../validator/single-choice.js';
import {
	CUSTOMER_RANGES,
	CustomerAnalyticsService,
	type CustomerAnalytics,
	type CustomerRange,
} from '../../services/analytics/customer-analytics.js';
import {
	CustomerLedgerAnalyticsService,
	LEDGER_KINDS,
	LEDGER_RANGES,
	type LedgerKind,
	type LedgerRange,
} from '../../services/analytics/customer-ledger-analytics.js';

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
	constructor(
		private readonly service: () => CustomerAnalyticsService = () => CustomerAnalyticsService.instance,
		private readonly ledgerService: () => CustomerLedgerAnalyticsService = () =>
			CustomerLedgerAnalyticsService.instance
	) {}

	public static analyticsValidator = [rangeValidator];
	public static ledgerValidator = [
		singleChoice('range', LEDGER_RANGES, '30'),
		singleChoice('kind', LEDGER_KINDS, 'all'),
	];

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

	/**
	 * @openapi
	 *
	 * /account/analytics/ledger:
	 *   get:
	 *     tags: [Account]
	 *     summary: Your on-ledger activity.
	 *     description: >-
	 *       Writes to the cheqd ledger paid from your own Studio payer account(s) over the last 7 or 30 whole UTC
	 *       days (including today): tiles, a per-day series by write type (key rotations are DID updates), a table by
	 *       identifier, a table by resource type, and your first and last write. Counts only: no fee or CHEQ figure,
	 *       no credential content. A customer with no payer account or no writes gets `state: empty`. When the ledger
	 *       data source cannot be read the answer is `{ supported: false, reason }`, never zeros. Cached for about
	 *       five minutes.
	 *     parameters:
	 *       - in: query
	 *         name: range
	 *         schema: { type: integer, enum: [7, 30], default: 30 }
	 *       - in: query
	 *         name: kind
	 *         description: Which identifiers to count. `agent` is DIDs created for agents, `organisation` the rest.
	 *         schema: { type: string, enum: [all, organisation, agent], default: all }
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CustomerLedgerAnalyticsResponse'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async ledger(request: Request, response: Response) {
		const customerId = response.locals.customer?.customerId as string | undefined;
		if (!customerId) {
			return response.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized Error' });
		}
		try {
			const range = Number(request.query.range ?? 30) as LedgerRange;
			const kind = (request.query.kind ?? 'all') as LedgerKind;
			return response.status(StatusCodes.OK).json(await this.ledgerService().ledger(customerId, range, kind));
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}
}
