import type Stripe from 'stripe';
import { StatusCodes } from 'http-status-codes';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { ICommonErrorResponse } from '../../types/authentication.js';

export type AccountDeletionStepOutcome = 'ok' | 'skipped' | `failed: ${string}`;

export interface AccountDeletionResult {
	stripeCancel: AccountDeletionStepOutcome;
	logtoDelete: AccountDeletionStepOutcome;
	dbDelete: AccountDeletionStepOutcome;
	success: boolean;
}

/**
 * The parts of SubscriptionService, UserService, CustomerService and LogToHelper that deleteCustomerAccount
 * needs. Narrowed to an interface (rather than importing the singletons directly) so tests can pass fakes
 * instead of hitting Stripe, Logto or the database.
 */
export interface AccountDeletionDeps {
	findCurrentSubscription: (customer: CustomerEntity) => Promise<{ subscriptionId: string } | null>;
	cancelSubscription: (stripe: Stripe, subscriptionId: string) => Promise<unknown>;
	findUserForCustomer: (customer: CustomerEntity) => Promise<{ logToId: string } | null>;
	deleteLogtoUser: (logToId: string) => Promise<ICommonErrorResponse>;
	deleteCustomer: (customer: CustomerEntity) => Promise<boolean>;
}

function initialResult(): AccountDeletionResult {
	return { stripeCancel: 'skipped', logtoDelete: 'skipped', dbDelete: 'skipped', success: false };
}

/**
 * Hard-deletes a customer account. Shared by the self-service `DELETE /account` endpoint and the admin
 * `DELETE /admin/organisation/delete` endpoint so support-triggered deletions go through the same pipeline
 * as self-service ones.
 *
 * Steps run in a fixed order — Stripe cancel, then Logto user delete, then the DB row (which cascades
 * through every customer-owned table) — so a mid-pipeline failure never leaves a still-billable
 * subscription attached to a gone or half-gone account. Stops at the first failing step; the returned
 * result records which steps completed so a retry can be informed about what's already done.
 */
export async function deleteCustomerAccount(
	customer: CustomerEntity,
	stripe: Stripe | undefined,
	deps: AccountDeletionDeps
): Promise<AccountDeletionResult> {
	const result = initialResult();

	// 1. Stripe — cancel any active/trialing subscription. Skipped entirely when Stripe isn't configured
	// (e.g. staging), matching the existing STRIPE_ENABLED gate used for Stripe account creation.
	if (process.env.STRIPE_ENABLED === 'true' && stripe && customer.paymentProviderId) {
		try {
			const subscription = await deps.findCurrentSubscription(customer);
			if (subscription) {
				await deps.cancelSubscription(stripe, subscription.subscriptionId);
			}
			result.stripeCancel = 'ok';
		} catch (error) {
			result.stripeCancel = `failed: ${(error as Error)?.message || error}`;
			return result;
		}
	}

	// 2. Logto — delete the user so they can't log back into a deleted account.
	try {
		const user = await deps.findUserForCustomer(customer);
		if (user) {
			const deleteResponse = await deps.deleteLogtoUser(user.logToId);
			if (deleteResponse.status !== StatusCodes.OK) {
				result.logtoDelete = `failed: ${deleteResponse.error}`;
				return result;
			}
		}
		result.logtoDelete = 'ok';
	} catch (error) {
		result.logtoDelete = `failed: ${(error as Error)?.message || error}`;
		return result;
	}

	// 3. DB — delete the customer row; FK cascades remove everything else owned by it.
	try {
		const deleted = await deps.deleteCustomer(customer);
		result.dbDelete = deleted ? 'ok' : 'failed: customer row was not found';
		if (!deleted) return result;
	} catch (error) {
		result.dbDelete = `failed: ${(error as Error)?.message || error}`;
		return result;
	}

	result.success = true;
	return result;
}

/**
 * Summarises a failed AccountDeletionResult as a single error string, for callers (e.g. GenericErrorResponse
 * consumers) that want one message rather than inspecting all three step outcomes themselves.
 */
export function describeAccountDeletionFailure(result: AccountDeletionResult): string {
	if (result.stripeCancel.startsWith('failed')) return `Stripe: ${result.stripeCancel}`;
	if (result.logtoDelete.startsWith('failed')) return `Logto: ${result.logtoDelete}`;
	if (result.dbDelete.startsWith('failed')) return `Database: ${result.dbDelete}`;
	return 'Account deletion failed for an unknown reason.';
}
