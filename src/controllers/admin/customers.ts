import type { Request, Response } from 'express';
import { query, param } from 'express-validator';
import { StatusCodes } from 'http-status-codes';
import { validate } from '../validator/decorator.js';
import { AdminAnalyticsService, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../services/admin/admin-analytics.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';

export const paginationValidators = [
	query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or more').bail(),
	query('limit')
		.optional()
		.isInt({ min: 1, max: MAX_PAGE_LIMIT })
		.withMessage(`limit must be 1 to ${MAX_PAGE_LIMIT}`)
		.bail(),
];

export class CustomersAdminController {
	constructor(private readonly service: () => AdminAnalyticsService = () => AdminAnalyticsService.instance) {}

	public static listValidator = [
		query('q').optional().isString().isLength({ max: 200 }).withMessage('q is at most 200 characters').bail(),
		query('plan').optional().isString().isLength({ max: 100 }).withMessage('plan is at most 100 characters').bail(),
		query('status').optional().isIn(['active', 'inactive']).withMessage('status must be active or inactive').bail(),
		...paginationValidators,
	];

	public static getValidator = [param('id').isUUID().withMessage('id must be a UUID').bail()];

	/**
	 * @openapi
	 *
	 * /admin/customers:
	 *   get:
	 *     summary: List customers (staff only).
	 *     description: >-
	 *       Staff search over customers, newest first. Counts only: never keys, credential contents, claim values or
	 *       API keys. Needs the `admin:customers:read` scope. `status` is `active` when the customer has a tracked
	 *       operation in the last 30 days and `inactive` otherwise. `plan` is the customer's plan name (`none` when it
	 *       has no paid or free plan role). `usage.apiCalls30d` counts tracked operations in the last 30 days.
	 *     tags: [Customers]
	 *     parameters:
	 *       - in: query
	 *         name: q
	 *         description: Matches name, email or id (case-insensitive substring).
	 *         schema:
	 *           type: string
	 *           maxLength: 200
	 *       - in: query
	 *         name: plan
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: status
	 *         schema:
	 *           type: string
	 *           enum: [active, inactive]
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
	 *                 customers:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/AdminCustomer'
	 *                 total:
	 *                   type: integer
	 *                   description: Customers matching the filters, across all pages.
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
		if (!requireStaffScope(response, STAFF_SCOPES.customersRead)) return response;
		try {
			const result = await this.service().listCustomers({
				q: request.query.q as string | undefined,
				plan: request.query.plan as string | undefined,
				status: request.query.status as string | undefined,
				page: Number(request.query.page ?? 1),
				limit: Number(request.query.limit ?? DEFAULT_PAGE_LIMIT),
			});
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/customers/{id}:
	 *   get:
	 *     summary: Get one customer (staff only).
	 *     description: >-
	 *       The same shape as the list, plus `paymentPlan` (the latest subscription status, or `none`), `agentCount`
	 *       (agents that are not deleted) and `segment` (`agents`: has at least one non-deleted agent; `people`: no
	 *       agents but has issued a credential; `unclassified`: neither) and `milestones` (when the customer first
	 *       created an identifier, registered an agent, created an API key, issued a credential, created a status
	 *       list, was credited by the faucet and made a tracked API call; null where not reached). Needs the
	 *       `admin:customers:read` scope.
	 *     tags: [Customers]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AdminCustomerDetail'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff.
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async get(request: Request, response: Response) {
		if (!requireStaffScope(response, STAFF_SCOPES.customersRead)) return response;
		try {
			const customer = await this.service().getCustomer(request.params.id as string);
			if (!customer) return response.status(StatusCodes.NOT_FOUND).json({ error: 'Customer not found.' });
			return response.status(StatusCodes.OK).json(customer);
		} catch (error) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: `Internal error: ${(error as Error)?.message || error}` });
		}
	}
}
