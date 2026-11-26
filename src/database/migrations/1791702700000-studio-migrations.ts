import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stored authority credentials (U-01, U-02): the signed credentials Studio issues to agents (authority grants and
 * payment address bindings), kept so the owner can download them again. Expand-only and additive: one new, empty
 * table that only the agent endpoints read and write. Nothing existing is read differently or rewritten, and grants
 * made before this change simply have no row (`hasCredential: false`).
 *
 * `sealed` holds the credential encrypted with `EXTERNAL_DB_ENCRYPTION_KEY` (never plaintext). Every row cascades
 * with its customer, agent, grant or binding, so account deletion removes it. At most one current (not superseded)
 * row per grant and per binding. Reversible: `down` drops the table.
 */
export class StudioMigrations1791702700000 implements MigrationInterface {
	name = 'StudioMigrations1791702700000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "authorityCredential" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customerId" uuid NOT NULL, "agentId" uuid NOT NULL, "grantId" uuid, "bindingId" uuid, "issuedCredentialId" character varying, "format" character varying(16) NOT NULL, "sealed" jsonb NOT NULL, "supersededAt" TIMESTAMP WITH TIME ZONE, "supersededById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_authorityCredential_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_authorityCredential_one_owner" CHECK (("grantId" IS NULL) <> ("bindingId" IS NULL)))`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_authorityCredential_customerId" ON "authorityCredential" ("customerId")`
		);
		await queryRunner.query(`CREATE INDEX "IDX_authorityCredential_agentId" ON "authorityCredential" ("agentId")`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_authorityCredential_grantId_current" ON "authorityCredential" ("grantId") WHERE "supersededAt" IS NULL`
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_authorityCredential_bindingId_current" ON "authorityCredential" ("bindingId") WHERE "supersededAt" IS NULL`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityCredential" ADD CONSTRAINT "FK_authorityCredential_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityCredential" ADD CONSTRAINT "FK_authorityCredential_agentId" FOREIGN KEY ("agentId") REFERENCES "agent"("agentId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityCredential" ADD CONSTRAINT "FK_authorityCredential_grantId" FOREIGN KEY ("grantId") REFERENCES "authorityGrant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityCredential" ADD CONSTRAINT "FK_authorityCredential_bindingId" FOREIGN KEY ("bindingId") REFERENCES "paymentAddressBinding"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityCredential" ADD CONSTRAINT "FK_authorityCredential_issuedCredentialId" FOREIGN KEY ("issuedCredentialId") REFERENCES "issuedCredential"("issuedCredentialId") ON DELETE SET NULL ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityCredential" ADD CONSTRAINT "FK_authorityCredential_supersededById" FOREIGN KEY ("supersededById") REFERENCES "authorityCredential"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "authorityCredential"`);
	}
}
