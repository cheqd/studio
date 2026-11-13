import { Connection } from '../../database/connection/connection.js';
import { IdempotencyKeyEntity } from '../../database/entities/idempotency-key.entity.js';
import type { IdempotencyRecord, IdempotencyStore } from './idempotency.js';

const toRecord = (row: IdempotencyKeyEntity & { customerId?: string }): IdempotencyRecord => ({
	id: row.id,
	customerId: row.customerId ?? row.customer?.customerId,
	key: row.key,
	route: row.route,
	requestHash: row.requestHash,
	state: row.state,
	txHash: row.txHash,
	response: row.response,
	expiresAt: row.expiresAt,
});

/**
 * Every call uses the repository directly, so each statement is its own implicit transaction on a pooled
 * connection: committed on return, and independent of any transaction the caller might hold.
 */
export class TypeormIdempotencyStore implements IdempotencyStore {
	private get repository() {
		return Connection.instance.dbConnection.getRepository(IdempotencyKeyEntity);
	}

	async insertSubmitting(row: {
		customerId: string;
		key: string;
		route: string;
		requestHash: string;
		expiresAt: Date;
	}): Promise<IdempotencyRecord | null> {
		// An expired row for the same key is cleared first, so a key can be reused after its retention ends
		await this.repository
			.createQueryBuilder()
			.delete()
			.where('"customerId" = :customerId AND "key" = :key AND "expiresAt" < now()', {
				customerId: row.customerId,
				key: row.key,
			})
			.execute();
		if (Connection.instance.dbConnection.options.type === 'postgres') {
			// ON CONFLICT keeps the common retry path quiet: no failed statement in the logs
			const rows: { id: string }[] = await this.repository.query(
				`INSERT INTO "idempotencyKey" ("customerId", "key", "route", "requestHash", "state", "expiresAt")
				 VALUES ($1, $2, $3, $4, 'submitting', $5)
				 ON CONFLICT ("customerId", "key") DO NOTHING
				 RETURNING "id"`,
				[row.customerId, row.key, row.route, row.requestHash, row.expiresAt]
			);
			if (rows.length === 0) return null;
			return {
				id: rows[0].id,
				customerId: row.customerId,
				key: row.key,
				route: row.route,
				requestHash: row.requestHash,
				state: 'submitting',
				expiresAt: row.expiresAt,
			};
		}
		try {
			const result = await this.repository.insert({
				customer: { customerId: row.customerId },
				key: row.key,
				route: row.route,
				requestHash: row.requestHash,
				state: 'submitting',
				expiresAt: row.expiresAt,
			});
			return {
				id: result.identifiers[0].id as string,
				customerId: row.customerId,
				key: row.key,
				route: row.route,
				requestHash: row.requestHash,
				state: 'submitting',
				expiresAt: row.expiresAt,
			};
		} catch (error) {
			// A unique violation on (customerId, key) means the key exists; anything else is a real failure
			if (await this.find(row.customerId, row.key)) return null;
			throw error;
		}
	}

	async find(customerId: string, key: string): Promise<IdempotencyRecord | null> {
		const row = await this.repository.findOne({
			where: { customer: { customerId }, key },
			relations: { customer: true },
		});
		return row ? toRecord(row) : null;
	}

	async settle(
		id: string,
		change: { state: IdempotencyRecord['state']; txHash?: string | null; response?: Record<string, unknown> | null }
	): Promise<void> {
		await this.repository.update({ id }, change as never);
	}

	async remove(id: string): Promise<void> {
		await this.repository.delete({ id });
	}
}
