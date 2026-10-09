import type { EntityManager, Repository } from 'typeorm';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { FaucetRequestEntity } from '../../database/entities/faucet-request.entity.js';
import { Connection } from '../../database/connection/connection.js';
import {
	fitsInQuota,
	getFaucetQuotaWindow,
	secondsUntilNextRequest,
	type FaucetQuotaLedger,
	type FaucetReservation,
	type FaucetReserveOptions,
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

	/** When the customer last made a faucet request, or null if never. */
	private static async lastRequestAt(manager: EntityManager, customerId: string): Promise<Date | null> {
		const row = await manager
			.createQueryBuilder(FaucetRequestEntity, 'request')
			.select('MAX(request.createdAt)', 'last')
			.where('request.customerId = :customerId', { customerId })
			.getRawOne<{ last: Date | string | null }>();
		return row?.last ? new Date(row.last) : null;
	}

	/**
	 * Seconds the customer must still wait before their next request (0 if allowed). This is a cheap read taken
	 * before any expensive work; `reserve` repeats the check under the lock so concurrent requests cannot slip through.
	 */
	public async getSecondsUntilNextAllowed(
		customer: CustomerEntity,
		minIntervalSeconds: number,
		now: Date = new Date()
	): Promise<number> {
		if (minIntervalSeconds <= 0) return 0;
		const last = await FaucetRequestService.lastRequestAt(
			this.faucetRequestRepository.manager,
			customer.customerId
		);
		return secondsUntilNextRequest(last, minIntervalSeconds, now);
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
		{ limitNcheq, minIntervalSeconds = 0 }: FaucetReserveOptions,
		now: Date = new Date()
	): Promise<FaucetReservation> {
		const window = getFaucetQuotaWindow(now);
		return this.faucetRequestRepository.manager.transaction(async (manager) => {
			if (manager.connection.options.type === 'postgres') {
				await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
					`faucet-quota:${customer.customerId}`,
				]);
			}

			if (minIntervalSeconds > 0) {
				const retryAfterSeconds = secondsUntilNextRequest(
					await FaucetRequestService.lastRequestAt(manager, customer.customerId),
					minIntervalSeconds,
					now
				);
				if (retryAfterSeconds > 0) {
					return { reserved: false, reason: 'too_frequent', retryAfterSeconds, window } as const;
				}
			}

			const usedNcheq = await FaucetRequestService.sumRequestedNcheq(manager, customer.customerId, window.start);
			if (!fitsInQuota(usedNcheq, amountNcheq, limitNcheq)) {
				return { reserved: false, reason: 'quota_exceeded', usedNcheq, window } as const;
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
