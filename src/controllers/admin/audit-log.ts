import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import { query } from 'express-validator';
import {
	AdminAnalyticsService,
	DEFAULT_PAGE_LIMIT,
	type AuditLogFilter,
} from '../../services/admin/admin-analytics.js';
import { paginationValidators } from './customers.js';
import { isRealDate } from './analytics.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';

export class AuditLogAdminController {
	constructor(private readonly service: () => AdminAnalyticsService = () => AdminAnalyticsService.instance) {}

	public static listValidator = [
		...paginationValidators,
		query('action')
			.optional()
			.isString()
			.matches(/^[a-z0-9][a-z0-9._:-]{0,99}$/)
			.withMessage('action is an action name such as customer.delete (lower case, at most 100 characters)')
			.bail(),
		query('actor')
			.optional()
			.isString()
			.isLength({ min: 1, max: 200 })
			.withMessage('actor is 1 to 200 characters')
			.bail(),
		query('targetCustomerId').optional().isUUID().withMessage('targetCustomerId must be a UUID').bail(),
		query('q').optional().isString().isLength({ min: 1, max: 200 }).withMessage('q is 1 to 200 characters').bail(),
		query('from').optional().custom(isRealDate).withMessage('from must be a date, YYYY-MM-DD (UTC)').bail(),
		query('to').optional().custom(isRealDate).withMessage('to must be a date, YYYY-MM-DD (UTC)').bail(),
		query('to')
			.optional()
			.custom((to, { req }) => {
				const from = req.query?.from as string | undefined;
				if (from !== undefined && Date.parse(`${from}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) {
					throw new Error('from must not be after to');
				}
				return true;
			})
			.bail(),
	];

	/**
	 * @openapi
	 *
	 * /admin/audit-log:
	 *   get:
	 *     summary: Staff audit log (staff only).
	 *     description: >-
	 *       Every staff action that changed state (customer deletion, feature flag changes), newest first. Append-only.
	 *       `target` is the customer id; the log never holds a customer's name or email, so an entry outlives the
	 *       customer it records. `staff` is the acting staff member's Studio email where known, otherwise the actor id.
	 *       Optional filters, combined with AND: `action`, `actor`, `targetCustomerId`, `q`, `from` and `to`; `total`
	 *       counts the matching entries. Needs the `admin:audit:read` scope.
	 *     tags: [Audit]
	 *     parameters:
	 *       - in: query
	 *         name: action
	 *         description: Exact action name.
	 *         schema:
	 *           type: string
	 *           example: customer.delete
	 *       - in: query
	 *         name: actor
	 *         description: The acting staff member, as the actor id or the staff email (case-insensitive), exact.
	 *         schema:
	 *           type: string
	 *           maxLength: 200
	 *       - in: query
	 *         name: targetCustomerId
	 *         description: The customer the action was about.
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - in: query
	 *         name: q
	 *         description: Case-insensitive text contained in the reason or the ticket reference.
	 *         schema:
	 *           type: string
	 *           maxLength: 200
	 *       - in: query
	 *         name: from
	 *         description: First UTC day (YYYY-MM-DD), included.
	 *         schema:
	 *           type: string
	 *           format: date
	 *       - in: query
	 *         name: to
	 *         description: Last UTC day (YYYY-MM-DD), included.
	 *         schema:
	 *           type: string
	 *           format: date
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
	 *               type: object
	 *               properties:
	 *                 entries:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       id: { type: string, format: uuid }
	 *                       when: { type: string, format: date-time }
	 *                       staff: { type: string }
	 *                       action: { type: string, example: customer.delete }
	 *                       target: { type: string, format: uuid, nullable: true }
	 *                       reason: { type: string }
	 *                       ticketRef: { type: string, nullable: true }
	 *                 total: { type: integer }
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
	public async list(request: Request, response: Response) {
		if (!requireStaffScope(response, STAFF_SCOPES.auditRead)) return response;
		try {
			const text = (name: string) => (request.query[name] as string | undefined) || undefined;
			const filter: AuditLogFilter = Object.fromEntries(
				(['action', 'actor', 'targetCustomerId', 'q', 'from', 'to'] as const)
					.map((name) => [name, text(name)])
					.filter(([, value]) => value !== undefined)
			);
			const result = await this.service().auditLog(
				Number(request.query.page ?? 1),
				Number(request.query.limit ?? DEFAULT_PAGE_LIMIT),
				filter
			);
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}
}
