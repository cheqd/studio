import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the indexes the staff analytics queries need on `operation` and `key`.
 *
 * Expand-only safety: three new indexes, no data change. `IF NOT EXISTS` keeps it safe to re-run. Reversible:
 * `down` drops them.
 *
 * - `IDX_operation_customerId_createdAt`: per-customer "last active" and 30-day call counts in the customer list,
 *   and top accounts, read `operation` by customer and time. `operation.customerId` had no index at all, so this
 *   also stops customer deletion (an `ON DELETE CASCADE`) scanning the whole table.
 * - `IDX_operation_createdAt`: the overview, endpoint and per-day series filter `operation` by a time range only
 *   (7, 30 or 90 days), across every customer.
 * - `IDX_key_customerId`: the customer list counts keys per customer for one page of customers, and `key` had no
 *   index on its tenant column (also the cascade path for customer deletion).
 *
 * Other tables the queries read already have what they need: `identifier(customerId, engine)`,
 * `issuedCredential(customerId)`, `agent(customerId)`, `agentCard(customerId)`, `faucetRequest(customerId,
 * createdAt)`, and `adminAuditLog(createdAt)` and `(targetCustomerId)`. `customer` and `customerActivation` hold a
 * few hundred rows, so scanning them is cheaper than maintaining another index.
 */
export class StudioMigrations1791701300000 implements MigrationInterface {
	name = 'StudioMigrations1791701300000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_operation_customerId_createdAt" ON "operation" ("customerId", "createdAt")`
		);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_operation_createdAt" ON "operation" ("createdAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_key_customerId" ON "key" ("customerId")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_key_customerId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_operation_createdAt"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_operation_customerId_createdAt"`);
	}
}
