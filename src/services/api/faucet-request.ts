import type { EntityManager, Repository } from 'typeorm';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { FaucetRequestEntity } from '../../database/entities/faucet-request.entity.js';
import { Connection } from '../../database/connection/connection.js';
import {
	fitsInQuota,
	getFaucetQuotaWindow,
	type FaucetQuotaLedger,
	type FaucetReservation,
} from '../../helpers/faucet-quota.js';

export class FaucetRequestService implements FaucetQuotaLedger {
	public faucetRequestRepository: Repository<FaucetRequestEntity>;

	public static instance = new FaucetRequestService();

	constructor(repository?: Repository<FaucetRequestEntity>) {
		this.faucetRequestRepository =
			repository ?? Connection.instance.dbConnection.getRepository(FaucetRequestEntity);
	}

	/** Total ncheq requested by the customer since `since`, using the given manager (and so its transaction). */
	private static async sumRequestedNcheq(manager: EntityManager, customerId: string, since: Date): Promise<bigint> {
		const row = await manager
			.createQueryBuilder(FaucetRequestEntity, 'request')
			.select('COALESCE(SUM(request.amountNcheq), 0)', 'total')
			.where('request.customerId = :customerId', { customerId })
			.andWhere('request.createdAt >= :since', { since })
			.getRawOne<{ total: string }>();
		return BigInt(row?.total ?? '0');
	}

	/** Total ncheq requested by the customer in the current quota window. */
	public async getUsedNcheq(customer: CustomerEntity, now: Date = new Date()): Promise<bigint> {
		const { start } = getFaucetQuotaWindow(now);
		return FaucetRequestService.sumRequestedNcheq(this.faucetRequestRepository.manager, customer.customerId, start);
	}

	/**
	 * Atomically checks the customer's monthly quota and, if the amount fits, records it.
	 * A per-customer advisory lock serialises concurrent requests so they cannot overshoot the limit.
	 * Call `release` if the upstream faucet call then definitely failed.
	 */
	public async reserve(
		customer: CustomerEntity,
		address: string,
		amountNcheq: bigint,
		limitNcheq: bigint,
		now: Date = new Date()
	): Promise<FaucetReservation> {
		const window = getFaucetQuotaWindow(now);
		return this.faucetRequestRepository.manager.transaction(async (manager) => {
			if (manager.connection.options.type === 'postgres') {
				await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
					`faucet-quota:${customer.customerId}`,
				]);
			}

			const usedNcheq = await FaucetRequestService.sumRequestedNcheq(manager, customer.customerId, window.start);
			if (!fitsInQuota(usedNcheq, amountNcheq, limitNcheq)) {
				return { reserved: false, usedNcheq, window } as const;
			}

			const entity = await manager.save(new FaucetRequestEntity(customer, address, amountNcheq));
			return { reserved: true, faucetRequestId: entity.faucetRequestId, usedNcheq, window } as const;
		});
	}

	/** Releases a reservation, e.g. when the upstream faucet reported that it did not credit the account. */
	public async release(faucetRequestId: string): Promise<void> {
		await this.faucetRequestRepository.delete({ faucetRequestId });
	}
}
