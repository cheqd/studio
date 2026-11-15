import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-day ledger writes for the staff on-ledger analytics. Expand-only and additive:
 * - new table `ledgerAddressDaily`: one row per funded address, UTC day, operation type and resource type
 *   (`''` for DID operations) with the number of writes and the fees paid (ncheq), filled by the ledger indexer sync;
 * - two nullable columns on `ledgerAddressActivity`: `dailySyncedAt` (null until the sync has stored the per-day rows
 *   for that address, so the sync backfills existing rows) and `dailyCompleteFrom` (the first UTC day from which the
 *   per-day rows are complete; null means complete from the first funding).
 * Nothing existing is read differently or rewritten. Reversible: `down` drops the columns and the table, and the
 * staff ledger-writes route then reports `supported: false` again.
 */
export class StudioMigrations1791702300000 implements MigrationInterface {
	name = 'StudioMigrations1791702300000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "ledgerAddressDaily" (
				"address" text NOT NULL,
				"day" date NOT NULL,
				"operationType" text NOT NULL,
				"resourceType" text NOT NULL DEFAULT '',
				"count" integer NOT NULL DEFAULT 0,
				"feeNcheq" bigint NOT NULL DEFAULT 0,
				CONSTRAINT "PK_ledgerAddressDaily" PRIMARY KEY ("address", "day", "operationType", "resourceType")
			)`
		);
		await queryRunner.query(`CREATE INDEX "IDX_ledgerAddressDaily_day" ON "ledgerAddressDaily" ("day")`);
		await queryRunner.query(
			`ALTER TABLE "ledgerAddressActivity" ADD COLUMN "dailySyncedAt" TIMESTAMP WITH TIME ZONE`
		);
		await queryRunner.query(`ALTER TABLE "ledgerAddressActivity" ADD COLUMN "dailyCompleteFrom" date`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "ledgerAddressActivity" DROP COLUMN "dailyCompleteFrom"`);
		await queryRunner.query(`ALTER TABLE "ledgerAddressActivity" DROP COLUMN "dailySyncedAt"`);
		await queryRunner.query(`DROP INDEX "IDX_ledgerAddressDaily_day"`);
		await queryRunner.query(`DROP TABLE "ledgerAddressDaily"`);
	}
}
