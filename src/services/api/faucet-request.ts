import type { Repository } from 'typeorm';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { FaucetRequestEntity } from '../../database/entities/faucet-request.entity.js';
import { Connection } from '../../database/connection/connection.js';
import { fitsInQuota, getFaucetQuotaWindow, type FaucetQuotaWindow } from '../../helpers/faucet-quota.js';

export type FaucetReservation =
	| { reserved: true; faucetRequestId: string; usedNcheq: bigint; window: FaucetQuotaWindow }
	| { reserved: false; usedNcheq: bigint; window: FaucetQuotaWindow };

export class FaucetRequestService {
	public faucetRequestRepository: Repository<FaucetRequestEntity>;

	public static instance = new FaucetRequestService();

	constructor() {
		this.faucetRequestRepository = Connection.instance.dbConnection.getRepository(FaucetRequestEntity);
	}

	/**
	 * Atomically checks the customer's monthly quota and, if the amount fits, records it.
	 * A per-customer advisory lock serialises concurrent requests so they cannot overshoot the limit.
	 * Call `release` if the upstream faucet call then fails.
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

			const row = await manager
				.createQueryBuilder(FaucetRequestEntity, 'request')
				.select('COALESCE(SUM(request.amountNcheq), 0)', 'total')
				.where('request.customerId = :customerId', { customerId: customer.customerId })
				.andWhere('request.createdAt >= :start', { start: window.start })
				.getRawOne<{ total: string }>();
			const usedNcheq = BigInt(row?.total ?? '0');

			if (!fitsInQuota(usedNcheq, amountNcheq, limitNcheq)) {
				return { reserved: false, usedNcheq, window } as const;
			}

			const entity = await manager.save(new FaucetRequestEntity(customer, address, amountNcheq));
			return { reserved: true, faucetRequestId: entity.faucetRequestId, usedNcheq, window } as const;
		});
	}

	/** Releases a reservation, e.g. when the upstream faucet call failed. */
	public async release(faucetRequestId: string): Promise<void> {
		await this.faucetRequestRepository.delete({ faucetRequestId });
	}
}
