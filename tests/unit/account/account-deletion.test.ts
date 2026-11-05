import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
	deleteCustomerAccount,
	describeAccountDeletionFailure,
	type AccountDeletionDeps,
	type AccountDeletionResult,
} from '../../../src/services/api/account-deletion.js';
import type { CustomerEntity } from '../../../src/database/entities/customer.entity.js';
import type Stripe from 'stripe';

const customerWithStripe = { customerId: 'cust-1', paymentProviderId: 'cus_stripe123' } as CustomerEntity;
const customerWithoutStripe = { customerId: 'cust-2', paymentProviderId: undefined } as unknown as CustomerEntity;
const stripe = {} as Stripe;

function makeDeps(overrides: Partial<AccountDeletionDeps> = {}): AccountDeletionDeps {
	return {
		findCurrentSubscription: jest.fn(async () => null),
		cancelSubscription: jest.fn(async () => ({})),
		findUserForCustomer: jest.fn(async () => ({ logToId: 'logto-user-1' })),
		deleteLogtoUser: jest.fn(async () => ({ status: 200, error: '', data: {} })),
		deleteCustomer: jest.fn(async () => true),
		...overrides,
	};
}

describe('deleteCustomerAccount', () => {
	const originalStripeEnabled = process.env.STRIPE_ENABLED;

	beforeEach(() => {
		process.env.STRIPE_ENABLED = 'true';
	});

	afterEach(() => {
		process.env.STRIPE_ENABLED = originalStripeEnabled;
	});

	it('cancels the active subscription, deletes the Logto user, then deletes the customer row, in that order', async () => {
		const calls: string[] = [];
		const deps = makeDeps({
			findCurrentSubscription: jest.fn(async () => {
				calls.push('findCurrentSubscription');
				return { subscriptionId: 'sub_1' };
			}),
			cancelSubscription: jest.fn(async () => {
				calls.push('cancelSubscription');
				return {};
			}),
			deleteLogtoUser: jest.fn(async () => {
				calls.push('deleteLogtoUser');
				return { status: 200, error: '', data: {} };
			}),
			deleteCustomer: jest.fn(async () => {
				calls.push('deleteCustomer');
				return true;
			}),
		});

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(result).toEqual({ stripeCancel: 'ok', logtoDelete: 'ok', dbDelete: 'ok', success: true });
		expect(calls).toEqual(['findCurrentSubscription', 'cancelSubscription', 'deleteLogtoUser', 'deleteCustomer']);
	});

	it('skips the Stripe step when there is no current subscription, but still proceeds', async () => {
		const deps = makeDeps();
		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(deps.cancelSubscription).not.toHaveBeenCalled();
		expect(result).toEqual({ stripeCancel: 'ok', logtoDelete: 'ok', dbDelete: 'ok', success: true });
	});

	it('skips the Stripe step entirely when STRIPE_ENABLED is not "true" (e.g. staging)', async () => {
		process.env.STRIPE_ENABLED = 'false';
		const deps = makeDeps();

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(deps.findCurrentSubscription).not.toHaveBeenCalled();
		expect(deps.cancelSubscription).not.toHaveBeenCalled();
		expect(result.stripeCancel).toBe('skipped');
		expect(result.success).toBe(true);
	});

	it('skips the Stripe step when the customer has no paymentProviderId', async () => {
		const deps = makeDeps();
		const result = await deleteCustomerAccount(customerWithoutStripe, stripe, deps);

		expect(deps.findCurrentSubscription).not.toHaveBeenCalled();
		expect(result.stripeCancel).toBe('skipped');
		expect(result.success).toBe(true);
	});

	it('skips the Logto step when the customer has no linked user, but still deletes the DB row', async () => {
		const deps = makeDeps({ findUserForCustomer: jest.fn(async () => null) });
		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(deps.deleteLogtoUser).not.toHaveBeenCalled();
		expect(result.logtoDelete).toBe('ok');
		expect(result.dbDelete).toBe('ok');
	});

	it('stops before deleting the Logto user or the DB row if cancelling the Stripe subscription fails', async () => {
		const deps = makeDeps({
			findCurrentSubscription: jest.fn(async () => ({ subscriptionId: 'sub_1' })),
			cancelSubscription: jest.fn(async () => {
				throw new Error('stripe is down');
			}),
		});

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(result.stripeCancel).toBe('failed: stripe is down');
		expect(result.logtoDelete).toBe('skipped');
		expect(result.dbDelete).toBe('skipped');
		expect(result.success).toBe(false);
		expect(deps.deleteLogtoUser).not.toHaveBeenCalled();
		expect(deps.deleteCustomer).not.toHaveBeenCalled();
	});

	it('stops before deleting the DB row if the Logto delete fails', async () => {
		const deps = makeDeps({
			deleteLogtoUser: jest.fn(async () => ({ status: 502, error: 'logto unreachable', data: {} })),
		});

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(result.logtoDelete).toBe('failed: logto unreachable');
		expect(result.dbDelete).toBe('skipped');
		expect(result.success).toBe(false);
		expect(deps.deleteCustomer).not.toHaveBeenCalled();
	});

	it('treats a Logto 404 (user already deleted) as success rather than a failure', async () => {
		// Mirrors LogToHelper.deleteUser's own handling: a 404 from Logto is mapped to a 200/ok response
		// before it ever reaches this pipeline, so from here it's indistinguishable from a normal success.
		const deps = makeDeps({
			deleteLogtoUser: jest.fn(async () => ({ status: 200, error: '', data: { alreadyDeleted: true } })),
		});

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(result.logtoDelete).toBe('ok');
		expect(result.success).toBe(true);
	});

	it('reports failure without throwing if the DB delete fails', async () => {
		const deps = makeDeps({
			deleteCustomer: jest.fn(async () => {
				throw new Error('connection reset');
			}),
		});

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(result.dbDelete).toBe('failed: connection reset');
		expect(result.success).toBe(false);
	});

	it('reports failure if the customer row was already gone (delete affected nothing)', async () => {
		const deps = makeDeps({ deleteCustomer: jest.fn(async () => false) });

		const result = await deleteCustomerAccount(customerWithStripe, stripe, deps);

		expect(result.dbDelete).toBe('failed: customer row was not found');
		expect(result.success).toBe(false);
	});
});

describe('describeAccountDeletionFailure', () => {
	const ok: AccountDeletionResult = { stripeCancel: 'ok', logtoDelete: 'ok', dbDelete: 'ok', success: true };

	it('reports the Stripe failure first, even if later steps also show failures', () => {
		const result: AccountDeletionResult = {
			...ok,
			success: false,
			stripeCancel: 'failed: stripe is down',
			logtoDelete: 'failed: logto is down',
		};
		expect(describeAccountDeletionFailure(result)).toBe('Stripe: failed: stripe is down');
	});

	it('reports the Logto failure when Stripe succeeded or was skipped', () => {
		const result: AccountDeletionResult = { ...ok, success: false, logtoDelete: 'failed: logto is down' };
		expect(describeAccountDeletionFailure(result)).toBe('Logto: failed: logto is down');
	});

	it('reports the DB failure when the earlier steps succeeded', () => {
		const result: AccountDeletionResult = { ...ok, success: false, dbDelete: 'failed: connection reset' };
		expect(describeAccountDeletionFailure(result)).toBe('Database: failed: connection reset');
	});
});
