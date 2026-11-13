import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `verificationEvent` table.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1 and 6.3).
 * Expand-only safety: one new, empty table that nothing reads or writes yet. It records which checks ran and the
 * verdict, never credential contents. `customerId` is nullable because a verifier may be anonymous later.
 */
export class StudioMigrations1791700400000 implements MigrationInterface {
	name = 'StudioMigrations1791700400000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "verificationEvent" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customerId" uuid, "subjectDid" text, "checks" jsonb NOT NULL DEFAULT '{}'::jsonb, "verdict" character varying(32) NOT NULL, "engine" character varying(16) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_verificationEvent_id" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_verificationEvent_customerId_createdAt" ON "verificationEvent" ("customerId", "createdAt")`
		);
		await queryRunner.query(
			`ALTER TABLE "verificationEvent" ADD CONSTRAINT "FK_verificationEvent_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "verificationEvent"`);
	}
}
