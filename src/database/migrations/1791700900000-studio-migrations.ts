import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `engine`, `network`, `outcome` and `durationMs` to `operation`.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1, 6.2 and 6.4).
 * Expand-only safety: four nullable columns with no default, which is metadata-only in Postgres 11 and later.
 * Current code does not write them, so they stay NULL until the new code starts to record them. This extends the
 * existing call log instead of adding a parallel metering table.
 */
export class StudioMigrations1791700900000 implements MigrationInterface {
	name = 'StudioMigrations1791700900000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "operation" ADD COLUMN "engine" character varying(16)`);
		await queryRunner.query(`ALTER TABLE "operation" ADD COLUMN "network" character varying(16)`);
		await queryRunner.query(`ALTER TABLE "operation" ADD COLUMN "outcome" character varying(16)`);
		await queryRunner.query(`ALTER TABLE "operation" ADD COLUMN "durationMs" integer`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "operation" DROP COLUMN "durationMs"`);
		await queryRunner.query(`ALTER TABLE "operation" DROP COLUMN "outcome"`);
		await queryRunner.query(`ALTER TABLE "operation" DROP COLUMN "network"`);
		await queryRunner.query(`ALTER TABLE "operation" DROP COLUMN "engine"`);
	}
}
