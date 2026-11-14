import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the per-agent activity table `agentEvent`, and backfill it for agents that already exist.
 *
 * The agent service writes one row per event (registered, authority granted, revoked or re-dated, key added or
 * rotated, card published or updated). It is customer-facing and separate from `adminAuditLog`, which records staff
 * actions: nothing from the staff log is read into it, and `actor` is one of `owner`, `api-key` or `system`, never an
 * email or a user id.
 *
 * Backfill (one-off, from timestamps Studio already holds, all with actor `system` because who acted was not
 * recorded): `registered` at `agent.createdAt`; `authority-granted` at `authorityGrant.createdAt`;
 * `authority-revoked` at `authorityGrant.revokedAt`; `card-published` at the first published card's `publishedAt`
 * and `card-updated` at `createdAt` for every other card version. Key events and expiry changes cannot be
 * backfilled (not recorded before this migration).
 *
 * Expand-only: a new table. Reversible: `down` drops it (and with it the backfill).
 */
export class StudioMigrations1791701800000 implements MigrationInterface {
	name = 'StudioMigrations1791701800000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "agentEvent" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "agentId" uuid NOT NULL, "customerId" uuid NOT NULL, "type" character varying(32) NOT NULL, "actor" character varying(16) NOT NULL, "detail" jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_agentEvent_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_agentEvent_type" CHECK ("type" IN ('registered', 'authority-granted', 'authority-revoked', 'authority-expiry-changed', 'key-added', 'key-rotated', 'card-published', 'card-updated')), CONSTRAINT "CHK_agentEvent_actor" CHECK ("actor" IN ('owner', 'api-key', 'system')))`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_agentEvent_agentId_createdAt" ON "agentEvent" ("agentId", "createdAt")`
		);
		await queryRunner.query(`CREATE INDEX "IDX_agentEvent_customerId" ON "agentEvent" ("customerId")`);
		await queryRunner.query(
			`ALTER TABLE "agentEvent" ADD CONSTRAINT "FK_agentEvent_agentId" FOREIGN KEY ("agentId") REFERENCES "agent"("agentId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "agentEvent" ADD CONSTRAINT "FK_agentEvent_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);

		// Backfill from the timestamps already held.
		await queryRunner.query(
			`INSERT INTO "agentEvent" ("agentId", "customerId", "type", "actor", "detail", "createdAt")
			 SELECT "agentId", "customerId", 'registered', 'system', '{}'::jsonb, "createdAt" FROM "agent"`
		);
		await queryRunner.query(
			`INSERT INTO "agentEvent" ("agentId", "customerId", "type", "actor", "detail", "createdAt")
			 SELECT "agentId", "customerId", 'authority-granted', 'system',
			        jsonb_build_object('grantId', "id", 'grantType', "grantType"), "createdAt"
			 FROM "authorityGrant"`
		);
		await queryRunner.query(
			`INSERT INTO "agentEvent" ("agentId", "customerId", "type", "actor", "detail", "createdAt")
			 SELECT "agentId", "customerId", 'authority-revoked', 'system',
			        jsonb_build_object('grantId', "id", 'grantType', "grantType"), "revokedAt"
			 FROM "authorityGrant" WHERE "revokedAt" IS NOT NULL`
		);
		await queryRunner.query(
			`INSERT INTO "agentEvent" ("agentId", "customerId", "type", "actor", "detail", "createdAt")
			 SELECT c."agentId", c."customerId",
			        CASE WHEN c."version" = (
			          SELECT MIN(p."version") FROM "agentCard" p WHERE p."agentId" = c."agentId" AND p."publishedAt" IS NOT NULL
			        ) THEN 'card-published' ELSE 'card-updated' END,
			        'system',
			        jsonb_build_object('version', c."version"),
			        COALESCE(c."publishedAt", c."createdAt")
			 FROM "agentCard" c`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "agentEvent"`);
	}
}
