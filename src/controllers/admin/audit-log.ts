import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import { AdminAnalyticsService, DEFAULT_PAGE_LIMIT } from '../../services/admin/admin-analytics.js';
import { paginationValidators } from './customers.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';

export class AuditLogAdminController {
	constructor(private readonly service: () => AdminAnalyticsService = () => AdminAnalyticsService.instance) {}

	public static listValidator = paginationValidators;

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
	 *       Needs the `admin:audit:read` scope.
	 *     tags: [Audit]
	 *     parameters:
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
			const result = await this.service().auditLog(
				Number(request.query.page ?? 1),
				Number(request.query.limit ?? DEFAULT_PAGE_LIMIT)
			);
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}
}
