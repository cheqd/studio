import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correct `engine` on status registries and issued credentials that were created through Credo but stored with the
 * column default ('veramo').
 *
 * Why it is provable: a Credo status list or credential is signed inside the customer's Credo tenant, so it can
 * only exist under a DID whose key lives there, and Studio records such a DID with `identifier.engine = 'credo'`.
 * Veramo cannot sign for that DID. So a row recorded as 'veramo' whose issuer DID is a Credo DID was written by
 * Credo. Rows are changed only when ALL of these hold, otherwise they are left alone:
 *   - the row says 'veramo' (the default that was wrongly kept) and the issuer DID's `identifier.engine` is 'credo';
 *   - no `engineMigration` row mentions the DID or the registry, so the DID did not move engines after the row was
 *     written (the one way a Veramo-made row could sit under a Credo DID);
 *   - for an issued credential: `providerId = 'studio'` (never Dock or another provider) and, when it has a status
 *     registry, that registry is on 'credo' after this migration, so the pair cannot disagree.
 *
 * Reversible: every change is first copied to `engineCorrection` (entity type, id, previous engine). `down`
 * restores exactly those rows, then drops the table. Rows changed by anything else after this ran are not touched
 * by `down`, because it only restores a row that still reads 'credo'.
 */
export class StudioMigrations1791702000000 implements MigrationInterface {
	name = 'StudioMigrations1791702000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "engineCorrection" ("entityType" character varying(32) NOT NULL, "entityId" text NOT NULL, "previousEngine" character varying(16) NOT NULL, "correctedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_engineCorrection" PRIMARY KEY ("entityType", "entityId"))`
		);

		// Status registries first, so credentials can be checked against the corrected value
		await queryRunner.query(
			`INSERT INTO "engineCorrection" ("entityType", "entityId", "previousEngine")
			 SELECT 'statusRegistry', sr."registryId", sr."engine"
			 FROM "statusRegistry" sr
			 JOIN "identifier" i ON i."did" = sr."issuerId"
			 WHERE sr."engine" = 'veramo' AND i."engine" = 'credo'
			   AND NOT EXISTS (SELECT 1 FROM "engineMigration" m
			     WHERE (m."entityType" = 'did' AND m."entityId" = i."did")
			        OR (m."entityType" = 'statusList' AND m."entityId" = sr."registryId"::text))`
		);
		await queryRunner.query(
			`UPDATE "statusRegistry" SET "engine" = 'credo'
			 WHERE "registryId"::text IN (SELECT "entityId" FROM "engineCorrection" WHERE "entityType" = 'statusRegistry')`
		);

		await queryRunner.query(
			`INSERT INTO "engineCorrection" ("entityType", "entityId", "previousEngine")
			 SELECT 'issuedCredential', ic."issuedCredentialId", ic."engine"
			 FROM "issuedCredential" ic
			 JOIN "identifier" i ON i."did" = ic."issuerId"
			 LEFT JOIN "statusRegistry" sr ON sr."registryId" = ic."statusRegistryId"
			 WHERE ic."engine" = 'veramo' AND ic."providerId" = 'studio' AND i."engine" = 'credo'
			   AND (ic."statusRegistryId" IS NULL OR sr."engine" = 'credo')
			   AND NOT EXISTS (SELECT 1 FROM "engineMigration" m WHERE m."entityType" = 'did' AND m."entityId" = i."did")`
		);
		await queryRunner.query(
			`UPDATE "issuedCredential" SET "engine" = 'credo'
			 WHERE "issuedCredentialId"::text IN (SELECT "entityId" FROM "engineCorrection" WHERE "entityType" = 'issuedCredential')`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`UPDATE "issuedCredential" ic SET "engine" = c."previousEngine"
			 FROM "engineCorrection" c
			 WHERE c."entityType" = 'issuedCredential' AND c."entityId" = ic."issuedCredentialId"::text AND ic."engine" = 'credo'`
		);
		await queryRunner.query(
			`UPDATE "statusRegistry" sr SET "engine" = c."previousEngine"
			 FROM "engineCorrection" c
			 WHERE c."entityType" = 'statusRegistry' AND c."entityId" = sr."registryId"::text AND sr."engine" = 'credo'`
		);
		await queryRunner.query(`DROP TABLE "engineCorrection"`);
	}
}
