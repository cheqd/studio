import { SubscriptionService } from '../admin/subscription.js';
import { UserService } from './user.js';
import { CustomerService } from './customer.js';
import { LogToHelper } from '../../middleware/auth/logto-helper.js';
import type { AccountDeletionDeps } from './account-deletion.js';

/**
 * The real Stripe/Logto/DB dependencies for deleteCustomerAccount. Kept in its own file, separate from
 * account-deletion.ts, so unit tests for the pipeline logic don't have to import (and therefore construct)
 * the whole singleton graph, several of which need real secrets (EXTERNAL_DB_ENCRYPTION_KEY etc.) just to
 * be instantiated.
 */
export const liveAccountDeletionDeps: AccountDeletionDeps = {
	findCurrentSubscription: (customer) => SubscriptionService.instance.findCurrent(customer),
	cancelSubscription: (stripe, subscriptionId) => SubscriptionService.instance.cancel(stripe, subscriptionId),
	findUserForCustomer: (customer) => UserService.instance.findOne({ customer: { customerId: customer.customerId } }),
	deleteLogtoUser: (logToId) => new LogToHelper().deleteUser(logToId),
	deleteCustomer: (customer) => CustomerService.instance.delete(customer),
};
