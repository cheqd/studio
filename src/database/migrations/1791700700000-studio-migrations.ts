import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `engineDiff` and `engineMigration` tables.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1, 6.3 and 6.4).
 * Expand-only safety: two new, empty tables that nothing reads or writes yet. `engineDiff` is tenant-scoped
 * (non-null `customerId` with an index, cascade on account deletion) and holds identifiers and verdicts only,
 * never claim values. `engineMigration` is a platform-level evidence trail, so it has no customer key. Its
 * `entityType` and `status` values are enforced by CHECK constraints.
 */
export class StudioMigrations1791700700000 implements MigrationInterface {
	name = 'StudioMigrations1791700700000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "engineDiff" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "route" text NOT NULL, "customerId" uuid NOT NULL, "primaryEngine" character varying(16) NOT NULL, "primaryHash" character varying(128) NOT NULL, "shadowHash" character varying(128) NOT NULL, "diff" jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_engineDiff_id" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(`CREATE INDEX "IDX_engineDiff_customerId" ON "engineDiff" ("customerId")`);
		await queryRunner.query(`CREATE INDEX "IDX_engineDiff_route_createdAt" ON "engineDiff" ("route", "createdAt")`);
		await queryRunner.query(
			`ALTER TABLE "engineDiff" ADD CONSTRAINT "FK_engineDiff_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);

		await queryRunner.query(
			`CREATE TABLE "engineMigration" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "entityType" character varying(16) NOT NULL, "entityId" text NOT NULL, "network" character varying(16), "fromEngine" character varying(16) NOT NULL, "toEngine" character varying(16) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'planned', "checkedBy" text, "checkedAt" TIMESTAMP WITH TIME ZONE, "error" text, CONSTRAINT "PK_engineMigration_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_engineMigration_entityType" CHECK ("entityType" IN ('did', 'statusList', 'resource')), CONSTRAINT "CHK_engineMigration_status" CHECK ("status" IN ('planned', 'verified-read', 'migrated', 'rolled-back', 'failed')))`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_engineMigration_entity" ON "engineMigration" ("entityType", "entityId")`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "engineMigration"`);
		await queryRunner.query(`DROP TABLE "engineDiff"`);
	}
}
