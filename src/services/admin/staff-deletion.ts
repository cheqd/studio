import type { EntityManager } from 'typeorm';
import { AdminAuditLogEntity } from '../../database/entities/admin-audit-log.entity.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { AccountDeletionDeps } from '../api/account-deletion.js';

export const MAX_REASON_LENGTH = 500;
export const MAX_TICKET_LENGTH = 100;

export interface StaffDeletionAudit {
	actorUserId: string;
	reason: string;
	ticketRef?: string;
	/** Counts and flags only. Never a name, email or key. */
	metadata: Record<string, unknown>;
}

export type TransactionRunner = <T>(work: (manager: EntityManager) => Promise<T>) => Promise<T>;

class CustomerRowNotFound extends Error {}

/**
 * The deletion dependencies with the database step replaced by one transaction that writes the `adminAuditLog` row
 * and deletes the customer. If the audit write fails the customer row is not deleted (the transaction rolls back and
 * the pipeline reports the database step as failed, which also restores the free-trial block it had recorded), and
 * if the customer row is gone the audit row is not kept either: the log never records a deletion that did not happen.
 */
export function withAuditedCustomerDelete(
	deps: AccountDeletionDeps,
	audit: StaffDeletionAudit,
	transaction: TransactionRunner
): AccountDeletionDeps {
	return {
		...deps,
		deleteCustomer: async (customer) => {
			try {
				return await transaction(async (manager) => {
					await manager.getRepository(AdminAuditLogEntity).insert({
						actorUserId: audit.actorUserId,
						action: 'customer.delete',
						targetCustomerId: customer.customerId,
						reason: audit.reason,
						ticketRef: audit.ticketRef,
						metadata: audit.metadata as never,
					});
					const result = await manager.delete(CustomerEntity, { customerId: customer.customerId });
					if (!result.affected) throw new CustomerRowNotFound();
					return true;
				});
			} catch (error) {
				if (error instanceof CustomerRowNotFound) return false;
				throw error;
			}
		},
	};
}
