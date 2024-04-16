import * as dotenv from 'dotenv';
import type { Request, Response } from 'express';
import { check } from 'express-validator';
import { validate } from '../validator/decorator.js';
import { CustomerService } from '../../services/api/customer.js';
import { StatusCodes } from 'http-status-codes';
import type { AdminOrganizationGetUnsuccessfulResponseBody, AdminOrganizationUpdateResponseBody, AdminOrganizationUpdateUnsuccessfulResponseBody } from '../../types/admin.js';
import { PaymentAccountService } from '../../services/api/payment-account.js';

dotenv.config();

export class OrganizationController {
	static organizationUpdatevalidator = [
		check('name').
			optional().
			isString().
			withMessage('name should be a valid string'),
		check('email').
			optional().
			isString().
			withMessage('email should be a valid string'),
		check('description').
			optional().
			isString().
			withMessage('description should be a valid string'),
	];


	/**
	 * @openapi
	 *
	 * /admin/organization/update:
	 *   post:
	 *     summary: Update an organization
	 *     description: Update an organization
	 *     tags: [Organization]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 example: Cheqd
	 *               email:
	 *                 type: string
	 *                 example: cheqd@example.com
	 *                 format: email
	 *               description:
	 *                 type: string
	 *                 example: Cheqd organization
	 *     responses:
	 *       200:
	 *         description: A successful response
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/OrganizationResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 * */
	@validate
	async update(request: Request, response: Response) {
		const { name, email, description } = request.body;
		try {
			const customer = await CustomerService.instance.update(response.locals.customer.customerId, name, email, description);
			const paymentAccount = await PaymentAccountService.instance.find({ customer: customer });

			if (!customer || !paymentAccount) {
				response.status(StatusCodes.NOT_FOUND).json({
					error: 'Customer for updating not found',
				} satisfies AdminOrganizationUpdateUnsuccessfulResponseBody);
			}

			return response.status(StatusCodes.OK).json({
				name: customer.name,
				email: customer.email,
				description: customer.description,
				cosmosAddress: paymentAccount[0].address as string
			} satisfies AdminOrganizationUpdateResponseBody);
		} catch (error) {
			return response.status(500).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies AdminOrganizationUpdateUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/organization/get:
	 *   get:
	 *     summary: Get an organization
	 *     description: Get an organization
	 *     tags: [Organization]
	 *     responses:
	 *       200:
	 *         description: A successful response
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/OrganizationResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 */ 
	async get(request: Request, response: Response) {
		try {
			const customer = response.locals.customer;
			const paymentAccount = await PaymentAccountService.instance.find({ customer: response.locals.customer });

			if (!customer || !paymentAccount) {
				response.status(StatusCodes.NOT_FOUND).json({
					error: 'Customer for current user was not found or did not setup properly. Please contact administrator.',
				} satisfies AdminOrganizationGetUnsuccessfulResponseBody);
			}
			return response.status(StatusCodes.OK).json({
				name: customer.name,
				email: customer.email,
				description: customer.description,
				cosmosAddress: paymentAccount[0].address as string,
			});
		} catch (error) {
			return response.status(500).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies AdminOrganizationGetUnsuccessfulResponseBody);
		}
	}
}
