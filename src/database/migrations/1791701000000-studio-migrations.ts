import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `issuedCredential.statusFormat`, `statusRegistry.listFormat` and `statusRegistry.encoding`.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1, 6.2 and 6.4).
 * Expand-only safety: three nullable columns with no default, which is metadata-only in Postgres 11 and later.
 * Existing rows stay NULL until the separate, batched backfill job fills them from the stored credential or list.
 * The immutability triggers ("a credential's status type and list format never change") are NOT added here: they
 * come after the backfill, as a later step of the plan.
 */
export class StudioMigrations1791701000000 implements MigrationInterface {
	name = 'StudioMigrations1791701000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD COLUMN "statusFormat" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "statusRegistry" ADD COLUMN "listFormat" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "statusRegistry" ADD COLUMN "encoding" character varying(16)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "statusRegistry" DROP COLUMN "encoding"`);
		await queryRunner.query(`ALTER TABLE "statusRegistry" DROP COLUMN "listFormat"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN "statusFormat"`);
	}
}
