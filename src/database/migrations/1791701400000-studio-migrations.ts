import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a nullable `source` to `customer` and `faucetRequest` (cheqd/studio#868).
 *
 * Expand-only safety: two nullable columns with no default, which is metadata-only in Postgres 11 and later.
 * Existing rows stay NULL ("unknown"); the backfill rule in the issue is a separate, documented data step. The
 * CHECK mirrors the pattern the API validates (`^[a-z0-9][a-z0-9-]{0,31}$`), so a value that bypasses the API
 * cannot hold free text. Reversible: `down` drops the constraints and columns.
 */
export class StudioMigrations1791701400000 implements MigrationInterface {
	name = 'StudioMigrations1791701400000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "customer" ADD COLUMN "source" character varying(32)`);
		await queryRunner.query(
			`ALTER TABLE "customer" ADD CONSTRAINT "CHK_customer_source" CHECK ("source" IS NULL OR "source" ~ '^[a-z0-9][a-z0-9-]{0,31}$')`
		);
		await queryRunner.query(`ALTER TABLE "faucetRequest" ADD COLUMN "source" character varying(32)`);
		await queryRunner.query(
			`ALTER TABLE "faucetRequest" ADD CONSTRAINT "CHK_faucetRequest_source" CHECK ("source" IS NULL OR "source" ~ '^[a-z0-9][a-z0-9-]{0,31}$')`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "faucetRequest" DROP CONSTRAINT "CHK_faucetRequest_source"`);
		await queryRunner.query(`ALTER TABLE "faucetRequest" DROP COLUMN "source"`);
		await queryRunner.query(`ALTER TABLE "customer" DROP CONSTRAINT "CHK_customer_source"`);
		await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "source"`);
	}
}
