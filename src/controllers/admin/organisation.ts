import * as dotenv from 'dotenv';
import type { Request, Response } from 'express';
import { check } from 'express-validator';
import { validate } from '../validator/decorator.js';
import { CustomerService } from '../../services/api/customer.js';
import { StatusCodes } from 'http-status-codes';
import type {
	AdminOrganisationGetResponseBody,
	AdminOrganisationGetUnsuccessfulResponseBody,
	AdminOrganisationUpdateResponseBody,
	AdminOrganisationUpdateUnsuccessfulResponseBody,
} from '../../types/admin.js';
import { PaymentAccountService } from '../../services/api/payment-account.js';
import { CheqdNetwork } from '@cheqd/sdk';
import { LocalStore } from '../../database/cache/store.js';
import { PaymentAccountEntity } from '../../database/entities/payment.account.entity.js';

dotenv.config();

export class OrganisationController {
	static organisationUpdatevalidator = [
		check('name').optional().isString().withMessage('name should be a valid string'),
		check('email').optional().isEmail().withMessage('email value should a well-formatted string'),
		check('description').optional().isString().withMessage('description should be a valid string'),
	];

	/**
	 * @openapi
	 *
	 * /admin/organisation/update:
	 *   post:
	 *     summary: Update an organisation
	 *     description: Update an organisation
	 *     tags: [Organisation]
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
	 *                 example: Cheqd organisation
	 *     responses:
	 *       200:
	 *         description: A successful response
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/OrganisationResponseBody'
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
			const customer = await CustomerService.instance.update({
				customerId: response.locals.customer.customerId,
				name,
				email,
				description,
			});

			const cachedAccounts = LocalStore.instance.getCustomerAccounts(response.locals.customer.customerId);
			let paymentAccounts: PaymentAccountEntity[];
			if (cachedAccounts?.length == 2) {
				paymentAccounts = cachedAccounts;
			} else {
				paymentAccounts = await PaymentAccountService.instance.find({ customer: response.locals.customer });
			}

			if (!customer || paymentAccounts.length === 0) {
				response.status(StatusCodes.NOT_FOUND).json({
					error: 'Customer for updating not found',
				} satisfies AdminOrganisationUpdateUnsuccessfulResponseBody);
			}

			const testnetAddress = paymentAccounts.find((acc) => acc.namespace === CheqdNetwork.Testnet)?.address;
			const mainnetAddress = paymentAccounts.find((acc) => acc.namespace === CheqdNetwork.Mainnet)?.address;

			return response.status(StatusCodes.OK).json({
				name: customer.name,
				email: customer.email,
				description: customer.description,
				cosmosAddress: {
					[CheqdNetwork.Testnet]: testnetAddress ?? null,
					[CheqdNetwork.Mainnet]: mainnetAddress ?? null,
				},
			} satisfies AdminOrganisationUpdateResponseBody);
		} catch (error) {
			return response.status(500).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies AdminOrganisationUpdateUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/organisation/get:
	 *   get:
	 *     summary: Get an organisation
	 *     description: Get an organisation
	 *     tags: [Organisation]
	 *     responses:
	 *       200:
	 *         description: A successful response
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/OrganisationResponseBody'
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

			if (!customer || paymentAccount.length === 0) {
				response.status(StatusCodes.NOT_FOUND).json({
					error: 'Customer for current user was not found or did not setup properly. Please contact administrator.',
				} satisfies AdminOrganisationGetUnsuccessfulResponseBody);
			}

			const testnetAddress = paymentAccount.find((acc) => acc.namespace === CheqdNetwork.Testnet)?.address;
			const mainnetAddress = paymentAccount.find((acc) => acc.namespace === CheqdNetwork.Mainnet)?.address;

			return response.status(StatusCodes.OK).json({
				name: customer.name,
				email: customer.email,
				description: customer.description,
				cosmosAddress: {
					[CheqdNetwork.Testnet]: testnetAddress ?? null,
					[CheqdNetwork.Mainnet]: mainnetAddress ?? null,
				},
			} satisfies AdminOrganisationGetResponseBody);
		} catch (error) {
			return response.status(500).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies AdminOrganisationGetUnsuccessfulResponseBody);
		}
	}
}
