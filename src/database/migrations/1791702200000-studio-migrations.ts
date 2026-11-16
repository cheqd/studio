import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `ledgerAddressActivity`: one summary row per faucet-funded address, filled by the ledger indexer sync (see
 * `src/services/ledger`). Expand-only: a new table, nothing existing is touched. Reversible: `down` drops it, and the
 * staff faucet-to-ledger route then reports the ledger-based elements as unsupported again.
 */
export class StudioMigrations1791702200000 implements MigrationInterface {
	name = 'StudioMigrations1791702200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "ledgerAddressActivity" (
				"address" text NOT NULL,
				"firstWriteAt" TIMESTAMP WITH TIME ZONE,
				"lastWriteAt" TIMESTAMP WITH TIME ZONE,
				"writeCount" integer NOT NULL DEFAULT 0,
				"didWriteCount" integer NOT NULL DEFAULT 0,
				"statusListWriteCount" integer NOT NULL DEFAULT 0,
				"otherResourceWriteCount" integer NOT NULL DEFAULT 0,
				"capped" boolean NOT NULL DEFAULT false,
				"checkedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				CONSTRAINT "PK_ledgerAddressActivity_address" PRIMARY KEY ("address")
			)`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ledgerAddressActivity_checkedAt" ON "ledgerAddressActivity" ("checkedAt")`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP INDEX "IDX_ledgerAddressActivity_checkedAt"`);
		await queryRunner.query(`DROP TABLE "ledgerAddressActivity"`);
	}
}
