import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `agent` and `agentCard` tables.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1 and 6.3).
 * Expand-only safety: two new, empty tables. Foreign keys point from the new tables to `customer` and
 * `identifier`, so no lock is taken on those tables beyond a brief share-row-exclusive lock, and no existing
 * code reads or writes these tables. `customerId` on `agentCard` is denormalised from the agent, so tenant
 * isolation does not need a join (plan 6.1: every tenant-scoped table has a non-null `customerId`).
 */
export class StudioMigrations1791700200000 implements MigrationInterface {
	name = 'StudioMigrations1791700200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "agent" ("agentId" uuid NOT NULL DEFAULT gen_random_uuid(), "customerId" uuid NOT NULL, "did" character varying NOT NULL, "name" text NOT NULL, "description" text, "actsForDid" text, "status" character varying(16) NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_agent_agentId" PRIMARY KEY ("agentId"))`
		);
		await queryRunner.query(`CREATE INDEX "IDX_agent_customerId" ON "agent" ("customerId")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_did" ON "agent" ("did")`);
		await queryRunner.query(
			`ALTER TABLE "agent" ADD CONSTRAINT "FK_agent_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "agent" ADD CONSTRAINT "FK_agent_did" FOREIGN KEY ("did") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);

		await queryRunner.query(
			`CREATE TABLE "agentCard" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "agentId" uuid NOT NULL, "customerId" uuid NOT NULL, "version" integer NOT NULL, "card" jsonb NOT NULL, "jws" text, "resourceId" text, "publishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_agentCard_id" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_agentCard_agentId_version" ON "agentCard" ("agentId", "version")`
		);
		await queryRunner.query(`CREATE INDEX "IDX_agentCard_customerId" ON "agentCard" ("customerId")`);
		await queryRunner.query(
			`ALTER TABLE "agentCard" ADD CONSTRAINT "FK_agentCard_agentId" FOREIGN KEY ("agentId") REFERENCES "agent"("agentId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "agentCard" ADD CONSTRAINT "FK_agentCard_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "agentCard"`);
		await queryRunner.query(`DROP TABLE "agent"`);
	}
}
