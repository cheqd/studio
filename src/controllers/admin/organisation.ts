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
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type Stripe from 'stripe';
import { deleteCustomerAccount, describeAccountDeletionFailure } from '../../services/api/account-deletion.js';
import { liveAccountDeletionDeps } from '../../services/api/account-deletion-live-deps.js';
import type { UnsuccessfulResponseBody } from '../../types/shared.js';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';

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

			if (!customer) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: 'Customer for updating not found',
				} satisfies AdminOrganisationUpdateUnsuccessfulResponseBody);
			}
			if (paymentAccounts.length === 0) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: 'Payment account was not found.',
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
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
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
				return response.status(StatusCodes.NOT_FOUND).json({
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
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies AdminOrganisationGetUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/organisation/delete:
	 *   delete:
	 *     summary: Permanently delete the organisation identified by the `customer-id` header.
	 *     description: >-
	 *       For support-triggered deletions (e.g. a customer emailing in to ask for their account to be
	 *       deleted) rather than self-service. Runs the same hard-delete pipeline as `DELETE /account`:
	 *       cancels any active Stripe subscription, deletes the Logto user, then deletes the customer row
	 *       and everything it owns. Does not export keys on the customer's behalf. Requires
	 *       `{ "confirm": true }` in the request body.
	 *     tags: [Organisation]
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [confirm]
	 *             properties:
	 *               confirm:
	 *                 type: boolean
	 *     responses:
	 *       200:
	 *         description: The organisation was deleted.
	 *       400:
	 *         description: Missing confirmation.
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       500:
	 *         description: The deletion pipeline failed partway through; the response body records which steps completed.
	 */
	async delete(request: Request, response: Response) {
		if (request.body?.confirm !== true) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'confirm must be set to true to delete the organisation.',
			} satisfies UnsuccessfulResponseBody);
		}

		const customer = response.locals.customer as CustomerEntity | undefined;
		if (!customer) {
			return response.status(StatusCodes.NOT_FOUND).json({
				error: 'No organisation found for the customer-id header supplied.',
			} satisfies UnsuccessfulResponseBody);
		}

		const stripe = response.locals.stripe as Stripe | undefined;
		const result = await deleteCustomerAccount(customer, stripe, liveAccountDeletionDeps);

		// Audit trail for a destructive, irreversible, support-triggered action: who (which M2M scopes) did
		// what (customerId/email) and whether it succeeded. scopes identify the calling credential's grant,
		// since the M2M auth strategy doesn't currently surface a caller identity beyond that (see #874).
		const callerScopes = (response.locals.scopes as string[] | undefined)?.join(' ') ?? 'unknown';
		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				result.success
					? `Admin-triggered deletion succeeded for customerId: ${customer.customerId} (email: ${customer.email}). Caller scopes: ${callerScopes}.`
					: `Admin-triggered deletion failed for customerId: ${customer.customerId} (email: ${customer.email}). Caller scopes: ${callerScopes}. ${describeAccountDeletionFailure(result)}`
			),
			severity: result.success ? 'info' : 'error',
		});

		if (!result.success) {
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: describeAccountDeletionFailure(result), ...result });
		}
		return response.status(StatusCodes.OK).json(result);
	}
}
