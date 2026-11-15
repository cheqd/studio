import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the `engine` column to `identifier`, `issuedCredential` and `statusRegistry`.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1, 6.2 and 6.4).
 * Expand-only safety: `varchar(16) NOT NULL DEFAULT 'veramo'` uses a constant default, which is metadata-only in
 * Postgres 11 and later (no table rewrite). Every existing row reads as 'veramo', and inserts from the current
 * code, which omit the column, get 'veramo'. The index on `identifier ("customerId", engine)` is created in the
 * later index migration (1791701100000).
 */
export class StudioMigrations1791700800000 implements MigrationInterface {
	name = 'StudioMigrations1791700800000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`ALTER TABLE "identifier" ADD COLUMN "engine" character varying(16) NOT NULL DEFAULT 'veramo'`
		);
		await queryRunner.query(
			`ALTER TABLE "issuedCredential" ADD COLUMN "engine" character varying(16) NOT NULL DEFAULT 'veramo'`
		);
		await queryRunner.query(
			`ALTER TABLE "statusRegistry" ADD COLUMN "engine" character varying(16) NOT NULL DEFAULT 'veramo'`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "statusRegistry" DROP COLUMN "engine"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN "engine"`);
		await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "engine"`);
	}
}
