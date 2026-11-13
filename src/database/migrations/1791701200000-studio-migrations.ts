import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `idempotencyKey` table.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan section 6.3; engine spec 3.4).
 * Expand-only safety: one new, empty table. Only the new agent routes write to it, and only when the caller
 * sends an `Idempotency-Key` header. `customerId` is NOT NULL with a cascading foreign key and an index.
 * Reversible: `down` drops the table, which nothing else references.
 */
export class StudioMigrations1791701200000 implements MigrationInterface {
	name = 'StudioMigrations1791701200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "idempotencyKey" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customerId" uuid NOT NULL, "key" character varying(255) NOT NULL, "route" character varying(255) NOT NULL, "requestHash" character varying(64) NOT NULL, "state" character varying(16) NOT NULL DEFAULT 'submitting', "txHash" character varying(128), "response" jsonb, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_idempotencyKey_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_idempotencyKey_state" CHECK ("state" IN ('submitting', 'succeeded', 'failed', 'unknown')))`
		);
		await queryRunner.query(`CREATE INDEX "IDX_idempotencyKey_customerId" ON "idempotencyKey" ("customerId")`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_idempotencyKey_customerId_key" ON "idempotencyKey" ("customerId", "key")`
		);
		await queryRunner.query(`CREATE INDEX "IDX_idempotencyKey_expiresAt" ON "idempotencyKey" ("expiresAt")`);
		await queryRunner.query(
			`ALTER TABLE "idempotencyKey" ADD CONSTRAINT "FK_idempotencyKey_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "idempotencyKey"`);
	}
}
