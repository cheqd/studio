import type Stripe from 'stripe';
import { StatusCodes } from 'http-status-codes';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { ICommonErrorResponse } from '../../types/authentication.js';

export type AccountDeletionStepOutcome = 'ok' | 'skipped' | `failed: ${string}`;

export interface AccountDeletionResult {
	stripeCancel: AccountDeletionStepOutcome;
	logtoDelete: AccountDeletionStepOutcome;
	recordDeletion: AccountDeletionStepOutcome;
	dbDelete: AccountDeletionStepOutcome;
	success: boolean;
}

/**
 * The parts of SubscriptionService, UserService, CustomerService, LogToHelper and DeletedAccountRecordService
 * that deleteCustomerAccount needs. Narrowed to an interface (rather than importing the singletons directly)
 * so tests can pass fakes instead of hitting Stripe, Logto or the database.
 */
export interface AccountDeletionDeps {
	findCurrentSubscription: (customer: CustomerEntity) => Promise<{ subscriptionId: string } | null>;
	cancelSubscription: (stripe: Stripe, subscriptionId: string) => Promise<unknown>;
	findUserForCustomer: (customer: CustomerEntity) => Promise<{ logToId: string } | null>;
	deleteLogtoUser: (logToId: string) => Promise<ICommonErrorResponse>;
	// Returns whatever was there before (or null), to pass to restorePriorDeletionRecord if the DB delete
	// that's supposed to follow this doesn't actually happen.
	recordAccountDeletion: (customer: CustomerEntity) => Promise<unknown>;
	// Rolls back recordAccountDeletion's write, restoring exactly what was there before rather than just
	// deleting the row (this email may already have been blocked by a genuinely earlier deletion). Only
	// ever called if the DB delete that follows step 3 fails.
	restorePriorDeletionRecord: (customer: CustomerEntity, previous: unknown) => Promise<void>;
	deleteCustomer: (customer: CustomerEntity) => Promise<boolean>;
}

function initialResult(): AccountDeletionResult {
	return {
		stripeCancel: 'skipped',
		logtoDelete: 'skipped',
		recordDeletion: 'skipped',
		dbDelete: 'skipped',
		success: false,
	};
}

/**
 * Hard-deletes a customer account. Shared by the self-service `DELETE /account` endpoint and the admin
 * `DELETE /admin/organisation/delete` endpoint so support-triggered deletions go through the same pipeline
 * as self-service ones.
 *
 * Steps run in a fixed order — Stripe cancel, then Logto user delete, then recording the deletion against
 * this email (so a later signup can't get a fresh free trial), then the DB row (which cascades through
 * every customer-owned table) — so a mid-pipeline failure never leaves a still-billable subscription
 * attached to a gone or half-gone account, and the deletion is always recorded before it's irreversible.
 * Stops at the first failing step; the returned result records which steps completed so a retry can be
 * informed about what's already done.
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

	// 3. Record the deletion against this email, so a later signup with the same email never gets a fresh
	// free trial (see DeletedAccountRecordService). Done before the DB delete, and aborts the pipeline if it
	// fails, so this can never be silently skipped by a step that runs after it.
	let priorDeletionRecord: unknown;
	try {
		priorDeletionRecord = await deps.recordAccountDeletion(customer);
		result.recordDeletion = 'ok';
	} catch (error) {
		result.recordDeletion = `failed: ${(error as Error)?.message || error}`;
		return result;
	}

	// 4. DB — delete the customer row; FK cascades remove everything else owned by it. If this step doesn't
	// actually succeed, the account was never really deleted, so step 3's record is rolled back -- otherwise
	// a still-intact account would be left permanently blocked from ever getting a free trial.
	try {
		const deleted = await deps.deleteCustomer(customer);
		if (!deleted) {
			result.dbDelete = 'failed: customer row was not found';
			await rollBackDeletionRecord(deps, customer, priorDeletionRecord, result);
			return result;
		}
		result.dbDelete = 'ok';
	} catch (error) {
		result.dbDelete = `failed: ${(error as Error)?.message || error}`;
		await rollBackDeletionRecord(deps, customer, priorDeletionRecord, result);
		return result;
	}

	result.success = true;
	return result;
}

/**
 * Best-effort rollback of the step-3 deletion record, called when the DB delete that was supposed to follow
 * it didn't actually happen. Failure here is appended to the dbDelete message (rather than thrown) so it
 * surfaces to whoever reads the result, since a failed rollback means the free-trial block is now incorrect
 * for an account that still exists.
 */
async function rollBackDeletionRecord(
	deps: AccountDeletionDeps,
	customer: CustomerEntity,
	priorDeletionRecord: unknown,
	result: AccountDeletionResult
): Promise<void> {
	try {
		await deps.restorePriorDeletionRecord(customer, priorDeletionRecord);
	} catch (rollbackError) {
		result.dbDelete =
			`${result.dbDelete} (also failed to roll back the deletion record: ${(rollbackError as Error)?.message || rollbackError})` as AccountDeletionStepOutcome;
	}
}

/**
 * Summarises a failed AccountDeletionResult as a single error string, for callers (e.g. GenericErrorResponse
 * consumers) that want one message rather than inspecting all three step outcomes themselves.
 */
export function describeAccountDeletionFailure(result: AccountDeletionResult): string {
	if (result.stripeCancel.startsWith('failed')) return `Stripe: ${result.stripeCancel}`;
	if (result.logtoDelete.startsWith('failed')) return `Logto: ${result.logtoDelete}`;
	if (result.recordDeletion.startsWith('failed')) return `Deletion record: ${result.recordDeletion}`;
	if (result.dbDelete.startsWith('failed')) return `Database: ${result.dbDelete}`;
	return 'Account deletion failed for an unknown reason.';
}
