import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `credo` schema for Credo's Askar storage.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1 and 6.4).
 * Expand-only safety: CREATE SCHEMA IF NOT EXISTS and nothing else. No tables are created, because Credo creates
 * and migrates its own storage there and only the CredoEngine reads it. No existing object is touched, so the
 * previous and the next application version both work against this schema.
 *
 * Role handling: if the `studio_api` role exists it gets USAGE and CREATE on the schema (Credo runs in the same
 * process). Where the role does not exist (for example local Postgres) the grant is skipped.
 *
 * Down drops the schema without CASCADE, so it refuses to run, and keeps the data, if Credo has created anything.
 */
export class StudioMigrations1791700100000 implements MigrationInterface {
	name = 'StudioMigrations1791700100000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "credo"`);
		await queryRunner.query(`
			DO $$
			BEGIN
				IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_api') THEN
					GRANT USAGE, CREATE ON SCHEMA "credo" TO "studio_api";
				ELSE
					RAISE NOTICE 'Role studio_api does not exist: skipping grants on schema credo';
				END IF;
			END
			$$
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP SCHEMA IF EXISTS "credo"`);
	}
}
