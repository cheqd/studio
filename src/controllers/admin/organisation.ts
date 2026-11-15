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
import validator from 'validator';
import { Connection } from '../../database/connection/connection.js';
import { AdminAuditLogEntity } from '../../database/entities/admin-audit-log.entity.js';
import { AdminAnalyticsService } from '../../services/admin/admin-analytics.js';
import {
	MAX_REASON_LENGTH,
	MAX_TICKET_LENGTH,
	withAuditedCustomerDelete,
} from '../../services/admin/staff-deletion.js';
import { checkStaffAccess, isM2MRequest, logStaffDenial, staffActor, STAFF_SCOPES } from './staff-guard.js';

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
	 *     summary: Permanently delete an organisation (staff only).
	 *     description: >-
	 *       For support-triggered deletions (e.g. a customer emailing in to ask for their account to be deleted)
	 *       rather than self-service. Runs the same hard-delete pipeline as `DELETE /account`: cancels any active
	 *       Stripe subscription, deletes the Logto user, then deletes the customer row and everything it owns. Does
	 *       not export keys on the customer's behalf and cannot remove records already written to the ledger.
	 *       The target is `customerId` from the body when given, otherwise the customer named by the `customer-id`
	 *       header (machine-to-machine calls). Staff cannot delete their own organisation. A customer on a paid plan
	 *       also needs `confirmPaidPlan: true`. The deletion and its `adminAuditLog` row (actor, action, customer
	 *       id, reason, ticket) are written in one transaction. Requires `{ "confirm": true }` and a `reason`.
	 *     tags: [Organisation]
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [confirm, reason]
	 *             properties:
	 *               confirm:
	 *                 type: boolean
	 *               reason:
	 *                 type: string
	 *                 minLength: 1
	 *                 maxLength: 500
	 *               ticketRef:
	 *                 type: string
	 *                 maxLength: 100
	 *                 description: Optional support ticket reference.
	 *               customerId:
	 *                 type: string
	 *                 format: uuid
	 *                 description: The customer to delete. Defaults to the customer named by the `customer-id` header.
	 *               confirmPaidPlan:
	 *                 type: boolean
	 *                 description: Must be true when the customer is on a paid plan.
	 *     responses:
	 *       200:
	 *         description: The organisation was deleted.
	 *       400:
	 *         description: Missing confirmation or reason, an invalid field, or a paid plan without `confirmPaidPlan`.
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: The caller is not staff, or is trying to delete their own organisation.
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       500:
	 *         description: The deletion pipeline failed partway through; the response body records which steps completed.
	 */
	async delete(request: Request, response: Response) {
		const access = checkStaffAccess(response, STAFF_SCOPES.organisationDelete);
		if (!access.allowed) {
			logStaffDenial(response, STAFF_SCOPES.organisationDelete, access.reason);
			await recordDeniedStaffAttempt(request, response, access.reason);
			return response.status(StatusCodes.FORBIDDEN).json({
				error: 'Only staff can use this endpoint.',
			} satisfies UnsuccessfulResponseBody);
		}
		if (request.body?.confirm !== true) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'confirm must be set to true to delete the organisation.',
			} satisfies UnsuccessfulResponseBody);
		}
		const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
		if (!reason || reason.length > MAX_REASON_LENGTH) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: `reason is required (1 to ${MAX_REASON_LENGTH} characters).`,
			} satisfies UnsuccessfulResponseBody);
		}
		const ticketRef = request.body?.ticketRef;
		if (ticketRef !== undefined && (typeof ticketRef !== 'string' || ticketRef.length > MAX_TICKET_LENGTH)) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: `ticketRef must be a string of at most ${MAX_TICKET_LENGTH} characters.`,
			} satisfies UnsuccessfulResponseBody);
		}
		const bodyCustomerId = request.body?.customerId;
		if (bodyCustomerId !== undefined && !(typeof bodyCustomerId === 'string' && validator.isUUID(bodyCustomerId))) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'customerId must be a UUID.',
			} satisfies UnsuccessfulResponseBody);
		}

		let customer: CustomerEntity | undefined | null;
		if (bodyCustomerId) {
			customer = await CustomerService.instance.get(bodyCustomerId);
		} else {
			customer = response.locals.customer as CustomerEntity | undefined;
		}
		if (!customer) {
			return response.status(StatusCodes.NOT_FOUND).json({
				error: 'No organisation found for the customer supplied.',
			} satisfies UnsuccessfulResponseBody);
		}

		// Staff cannot delete their own organisation. On the portal path the authenticated customer is the staff
		// member's own; on the M2M path it is the target named by the header, so there is no caller to compare.
		const staffCustomerId = isM2MRequest(request)
			? undefined
			: (response.locals.customer as CustomerEntity | undefined)?.customerId;
		if (staffCustomerId && staffCustomerId === customer.customerId) {
			return response.status(StatusCodes.FORBIDDEN).json({
				error: 'Staff cannot delete their own organisation here. Use DELETE /account.',
			} satisfies UnsuccessfulResponseBody);
		}

		const { plan, paid } = await AdminAnalyticsService.instance.getPlan(customer.customerId);
		if (paid && request.body?.confirmPaidPlan !== true) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'This customer is on a paid plan. Set confirmPaidPlan to true to delete it.',
			} satisfies UnsuccessfulResponseBody);
		}

		const actorUserId = staffActor(request, response);
		const audit = {
			actorUserId,
			reason,
			ticketRef: ticketRef as string | undefined,
			metadata: { plan, paid, source: customer.source ?? null },
		};
		const stripe = response.locals.stripe as Stripe | undefined;
		const result = await deleteCustomerAccount(
			customer,
			stripe,
			withAuditedCustomerDelete(liveAccountDeletionDeps, audit, (work) =>
				Connection.instance.dbConnection.transaction(work)
			)
		);

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
			// The deletion itself is not recorded (nothing was deleted), so record the failed attempt, best effort
			try {
				await Connection.instance.dbConnection.getRepository(AdminAuditLogEntity).insert({
					actorUserId,
					action: 'customer.delete.failed',
					targetCustomerId: customer.customerId,
					reason,
					ticketRef: audit.ticketRef,
					metadata: { ...audit.metadata, failure: describeAccountDeletionFailure(result) } as never,
				});
			} catch (error) {
				console.error(`Could not record the failed deletion in the audit log: ${(error as Error)?.message}`);
			}
			return response
				.status(StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ error: describeAccountDeletionFailure(result), ...result });
		}
		return response.status(StatusCodes.OK).json(result);
	}
}

/**
 * Writes a refused staff deletion to the admin audit log, best effort: the actor's Logto user id, the route and a
 * reason code. No email is recorded. The log write never changes the 403 the caller gets.
 */
async function recordDeniedStaffAttempt(request: Request, response: Response, reasonCode: string) {
	const target = request.body?.customerId;
	try {
		await Connection.instance.dbConnection.getRepository(AdminAuditLogEntity).insert({
			actorUserId: staffActor(request, response),
			action: 'staff.access.denied',
			targetCustomerId: typeof target === 'string' && validator.isUUID(target) ? target : undefined,
			reason: reasonCode,
			metadata: { route: 'DELETE /admin/organisation/delete', reasonCode } as never,
		});
	} catch (error) {
		console.error(`Could not record the denied staff attempt in the audit log: ${(error as Error)?.message}`);
	}
}
