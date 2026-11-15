import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the append-only `adminAuditLog` table.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1, 6.3 and 6.4).
 * Expand-only safety: one new, empty table that nothing reads or writes yet. There is deliberately no foreign key
 * to `customer`, so a row survives the customer deletion it records.
 *
 * Append-only enforcement: if the `studio_api` role exists, all its privileges on the table are revoked and it is
 * granted INSERT and SELECT only (no UPDATE, DELETE or TRUNCATE). This is defensive:
 *   - where the role does not exist (for example local Postgres) the grants are skipped with a NOTICE;
 *   - if the migration itself runs as `studio_api` (it then owns the table and can re-grant itself anything) the
 *     revoke is skipped with a NOTICE, because it would give a false sense of safety. The guarantee holds when
 *     the migration runs as the separate `migrator` role (plan 6.1), which then owns the table.
 */
export class StudioMigrations1791700600000 implements MigrationInterface {
	name = 'StudioMigrations1791700600000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "adminAuditLog" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "actorUserId" text NOT NULL, "action" text NOT NULL, "targetCustomerId" uuid, "reason" text NOT NULL, "ticketRef" text, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_adminAuditLog_id" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_adminAuditLog_targetCustomerId" ON "adminAuditLog" ("targetCustomerId")`
		);
		await queryRunner.query(`CREATE INDEX "IDX_adminAuditLog_createdAt" ON "adminAuditLog" ("createdAt")`);
		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_api') THEN
					RAISE NOTICE 'Role studio_api does not exist: skipping append-only grants on adminAuditLog';
				ELSIF current_user = 'studio_api' THEN
					RAISE NOTICE 'Migration runs as studio_api, which owns adminAuditLog: skipping revoke. Run migrations as the migrator role to enforce append-only';
				ELSE
					REVOKE ALL ON TABLE "adminAuditLog" FROM "studio_api";
					GRANT INSERT, SELECT ON TABLE "adminAuditLog" TO "studio_api";
				END IF;
			END
			$$
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "adminAuditLog"`);
	}
}
