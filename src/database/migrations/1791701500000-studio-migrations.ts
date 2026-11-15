import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `customerActivation`: one row per customer with the time of each activation milestone (cheqd/studio#869).
 *
 * Expand-only safety: one new table, tenant-scoped (`customerId` is the primary key and a cascading foreign key,
 * so the row goes when the customer does). Nothing reads it until the staff analytics endpoints do. The backfill
 * fills the milestones that existing data can answer (DID from the first successful `did-create` operation,
 * credential from `issuedCredential.issuedAt`, agent from `agent`, status list from `statusRegistry`); later events are
 * written by `recordActivation`. Customers with no milestone get no row. Reversible: `down` drops the table.
 */
export class StudioMigrations1791701500000 implements MigrationInterface {
	name = 'StudioMigrations1791701500000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "customerActivation" ("customerId" uuid NOT NULL, "firstDidCreatedAt" TIMESTAMP WITH TIME ZONE, "firstCredentialIssuedAt" TIMESTAMP WITH TIME ZONE, "firstAgentRegisteredAt" TIMESTAMP WITH TIME ZONE, "firstStatusListCreatedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_customerActivation_customerId" PRIMARY KEY ("customerId"))`
		);
		await queryRunner.query(
			`ALTER TABLE "customerActivation" ADD CONSTRAINT "FK_customerActivation_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`INSERT INTO "customerActivation" ("customerId", "firstDidCreatedAt", "firstCredentialIssuedAt", "firstAgentRegisteredAt", "firstStatusListCreatedAt")
			 SELECT * FROM (
				SELECT c."customerId",
					(SELECT MIN(o."createdAt") FROM "operation" o WHERE o."customerId" = c."customerId" AND o."operationName" = 'did-create' AND o."successful") AS did,
					(SELECT MIN(ic."issuedAt") FROM "issuedCredential" ic WHERE ic."customerId" = c."customerId" AND ic."category" = 'credential' AND ic."status" IN ('issued', 'suspended', 'revoked')) AS credential,
					(SELECT MIN(a."createdAt") FROM "agent" a WHERE a."customerId" = c."customerId") AS agent,
					(SELECT MIN(sr."createdAt") FROM "statusRegistry" sr WHERE sr."customerId" = c."customerId") AS statuslist
				FROM "customer" c
			 ) t WHERE t.did IS NOT NULL OR t.credential IS NOT NULL OR t.agent IS NOT NULL OR t.statuslist IS NOT NULL`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "customerActivation"`);
	}
}
