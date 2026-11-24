import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the staff audit-log filters (U-43). Expand-only: two new indexes, no data change. `adminAuditLog`
 * holds one row per staff action (small), so building them takes moments; `lock_timeout` bounds the wait for the
 * lock and `IF NOT EXISTS` keeps the migration safe to re-run. Reversible: `down` drops them.
 *
 * - `IDX_adminAuditLog_action_createdAt`: filter by `action`, newest first.
 * - `IDX_adminAuditLog_actorUserId_createdAt`: filter by actor id, newest first.
 * `targetCustomerId` and `createdAt` (the date filters) are already indexed. The text filter `q` is a substring
 * match on two short columns of a small table and needs no index.
 */
export class StudioMigrations1791702500300 implements MigrationInterface {
	name = 'StudioMigrations1791702500300';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_adminAuditLog_action_createdAt" ON "adminAuditLog" ("action", "createdAt")`
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_adminAuditLog_actorUserId_createdAt" ON "adminAuditLog" ("actorUserId", "createdAt")`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_adminAuditLog_actorUserId_createdAt"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_adminAuditLog_action_createdAt"`);
	}
}
