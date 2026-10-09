import type { EntityManager, Repository } from 'typeorm';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { FaucetRequestEntity } from '../../database/entities/faucet-request.entity.js';
import { Connection } from '../../database/connection/connection.js';
import { FAUCET_PENDING_TIMEOUT_SECONDS, FAUCET_REQUEST_RETENTION_MONTHS } from '../../types/constants.js';
import {
	addressRoomNcheq,
	fitsInQuota,
	getFaucetQuotaWindow,
	logFaucetEvent,
	retentionCutoff,
	secondsUntilNextRequest,
	type FaucetQuotaLedger,
	type FaucetReservation,
	type FaucetReserveOptions,
} from '../../helpers/faucet-quota.js';

// Retention cleanup runs inside normal requests (Studio has no scheduler), at most this often per process
const RETENTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export class FaucetRequestService implements FaucetQuotaLedger {
	public faucetRequestRepository: Repository<FaucetRequestEntity>;
	private lastRetentionCleanupAt = 0;

	public static instance = new FaucetRequestService();

	constructor(repository?: Repository<FaucetRequestEntity>) {
		this.faucetRequestRepository =
			repository ?? Connection.instance.dbConnection.getRepository(FaucetRequestEntity);
	}

	private static pendingCutoff(now: Date, pendingTimeoutSeconds: number): Date {
		return new Date(now.getTime() - pendingTimeoutSeconds * 1000);
	}

	/**
	 * Total ncheq requested by the customer since `since`, using the given manager (and so its transaction).
	 * Completed and unknown requests always count; a pending one counts only until it is older than
	 * `pendingCutoff`, after which it is treated as abandoned.
	 */
	private static async sumRequestedNcheq(
		manager: EntityManager,
		customerId: string,
		since: Date,
		pendingCutoff: Date
	): Promise<bigint> {
		const row = await manager
			.createQueryBuilder(FaucetRequestEntity, 'request')
			.select('COALESCE(SUM(request.amountNcheq), 0)', 'total')
			.where('request.customerId = :customerId', { customerId })
			.andWhere('request.createdAt >= :since', { since })
			.andWhere(
				`(request.status IN ('completed', 'unknown') OR (request.status = 'pending' AND request.createdAt >= :pendingCutoff))`,
				{ pendingCutoff }
			)
			.getRawOne<{ total: string }>();
		return BigInt(row?.total ?? '0');
	}

	/** Total ncheq requested for one address since `since`, excluding abandoned reservations. */
	private static async sumRecentForAddress(
		manager: EntityManager,
		customerId: string,
		address: string,
		since: Date
	): Promise<bigint> {
		const row = await manager
			.createQueryBuilder(FaucetRequestEntity, 'request')
			.select('COALESCE(SUM(request.amountNcheq), 0)', 'total')
			.where('request.customerId = :customerId', { customerId })
			.andWhere('request.address = :address', { address })
			.andWhere('request.createdAt >= :since', { since })
			.andWhere(`request.status <> 'abandoned'`)
			.getRawOne<{ total: string }>();
		return BigInt(row?.total ?? '0');
	}

	/** When the customer last made a faucet request, or null if never. */
	private static async lastRequestAt(manager: EntityManager, customerId: string): Promise<Date | null> {
		const row = await manager
			.createQueryBuilder(FaucetRequestEntity, 'request')
			.select('MAX(request.createdAt)', 'last')
			.where('request.customerId = :customerId', { customerId })
			.andWhere(`request.status <> 'abandoned'`)
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
	public async getUsedNcheq(
		customer: CustomerEntity,
		now: Date = new Date(),
		pendingTimeoutSeconds: number = FAUCET_PENDING_TIMEOUT_SECONDS
	): Promise<bigint> {
		const { start } = getFaucetQuotaWindow(now);
		return FaucetRequestService.sumRequestedNcheq(
			this.faucetRequestRepository.manager,
			customer.customerId,
			start,
			FaucetRequestService.pendingCutoff(now, pendingTimeoutSeconds)
		);
	}

	/**
	 * Atomically checks the customer's monthly quota and, if the amount fits, records it as pending.
	 * A per-customer advisory lock serialises concurrent requests so they cannot overshoot the limit.
	 * Afterwards call `complete` when the faucet confirms, `release` if it definitely failed, or `markUnknown`
	 * if the call threw.
	 */
	public async reserve(
		customer: CustomerEntity,
		address: string,
		amountNcheq: bigint,
		{
			limitNcheq,
			minIntervalSeconds = 0,
			pendingTimeoutSeconds = FAUCET_PENDING_TIMEOUT_SECONDS,
			addressCap,
		}: FaucetReserveOptions,
		now: Date = new Date()
	): Promise<FaucetReservation> {
		const window = getFaucetQuotaWindow(now);
		const reservation = await this.faucetRequestRepository.manager.transaction(async (manager) => {
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

			// Reservations that were never confirmed stop counting; mark them so the history shows why
			const pendingCutoff = FaucetRequestService.pendingCutoff(now, pendingTimeoutSeconds);
			const swept = await manager
				.createQueryBuilder()
				.update(FaucetRequestEntity)
				.set({ status: 'abandoned' })
				.where('customerId = :customerId', { customerId: customer.customerId })
				.andWhere(`status = 'pending'`)
				.andWhere('createdAt < :pendingCutoff', { pendingCutoff })
				.execute();
			if (swept.affected) {
				logFaucetEvent('warn', 'faucet.reservations_abandoned', {
					customerId: customer.customerId,
					count: swept.affected,
					pendingTimeoutSeconds,
				});
			}

			const usedNcheq = await FaucetRequestService.sumRequestedNcheq(
				manager,
				customer.customerId,
				window.start,
				pendingCutoff
			);
			if (!fitsInQuota(usedNcheq, amountNcheq, limitNcheq)) {
				return { reserved: false, reason: 'quota_exceeded', usedNcheq, window } as const;
			}

			// The balance the caller read may not include transfers still on their way, so subtract recent requests
			// for this address. Done under the lock, this stops simultaneous requests each getting the full room.
			if (addressCap) {
				const inFlightNcheq = await FaucetRequestService.sumRecentForAddress(
					manager,
					customer.customerId,
					address,
					new Date(now.getTime() - addressCap.settleSeconds * 1000)
				);
				const roomNcheq = addressRoomNcheq(addressCap.capNcheq, addressCap.currentBalanceNcheq, inFlightNcheq);
				if (amountNcheq > roomNcheq) {
					return { reserved: false, reason: 'address_cap_exceeded', roomNcheq, window } as const;
				}
			}

			const entity = await manager.save(new FaucetRequestEntity(customer, address, amountNcheq));
			return { reserved: true, faucetRequestId: entity.faucetRequestId, usedNcheq, window } as const;
		});
		this.maybeRunRetentionCleanup(now);
		return reservation;
	}

	/** Deletes faucet request rows older than the retention period. Returns how many were deleted. */
	public async runRetentionCleanup(
		now: Date = new Date(),
		retentionMonths: number = FAUCET_REQUEST_RETENTION_MONTHS
	): Promise<number> {
		if (retentionMonths <= 0) return 0;
		const result = await this.faucetRequestRepository
			.createQueryBuilder()
			.delete()
			.from(FaucetRequestEntity)
			.where('createdAt < :cutoff', { cutoff: retentionCutoff(now, retentionMonths) })
			.execute();
		return result.affected ?? 0;
	}

	/**
	 * Runs the retention cleanup in the background, at most once an hour per process. Called from normal requests
	 * because Studio has no scheduler; it never delays or fails the request that triggered it.
	 */
	private maybeRunRetentionCleanup(now: Date): void {
		if (FAUCET_REQUEST_RETENTION_MONTHS <= 0) return;
		if (now.getTime() - this.lastRetentionCleanupAt < RETENTION_CLEANUP_INTERVAL_MS) return;
		this.lastRetentionCleanupAt = now.getTime();
		this.runRetentionCleanup(now)
			.then((deleted) => {
				if (deleted > 0) logFaucetEvent('info', 'faucet.retention_deleted', { deleted });
			})
			.catch((error) =>
				logFaucetEvent('error', 'faucet.retention_failed', {
					error: (error as Error)?.message ?? String(error),
				})
			);
	}

	/** Releases a reservation, e.g. when the upstream faucet reported that it did not credit the account. */
	public async release(faucetRequestId: string): Promise<void> {
		await this.faucetRequestRepository.delete({ faucetRequestId });
	}

	/** The faucet confirmed the credit. Also applies to a reservation that was already marked abandoned. */
	public async complete(faucetRequestId: string): Promise<void> {
		await this.faucetRequestRepository.update(
			{ faucetRequestId },
			{ status: 'completed', completedAt: new Date() }
		);
	}

	/** The faucet call threw, so tokens may have been sent: keep counting this reservation permanently. */
	public async markUnknown(faucetRequestId: string): Promise<void> {
		await this.faucetRequestRepository.update({ faucetRequestId }, { status: 'unknown' });
	}
}
