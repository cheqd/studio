import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Failed ledger writes in the account's activity (U-30). Expand-only and additive: one nullable column
 * `operation.errorCategory` (`varchar(32)`, no default), set only on the unsuccessful row Studio now writes when a
 * DID, resource or status list write fails (`insufficient_funds`, `out_of_gas`, `ledger_unavailable`, `rejected` or
 * `other`). Adding a nullable column without a default is a catalogue change in Postgres: no table rewrite and no
 * scan, so the lock on the large `operation` table is held for a moment only, bounded by `lock_timeout`. No
 * backfill: earlier failures were never recorded. Existing rows read as null. Reversible: `down` drops the column.
 */
export class StudioMigrations1791702500200 implements MigrationInterface {
	name = 'StudioMigrations1791702500200';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`ALTER TABLE "operation" ADD COLUMN IF NOT EXISTS "errorCategory" character varying(32)`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "operation" DROP COLUMN IF EXISTS "errorCategory"`);
	}
}
