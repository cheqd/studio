import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `authorityGrant` and `paymentAddressBinding` tables.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1 and 6.3).
 * Expand-only safety: two new, empty tables that nothing reads or writes yet. Foreign keys to `issuedCredential`
 * and `statusRegistry` use ON DELETE SET NULL, so removing a credential or a list never blocks, or cascades
 * into, a grant. `customerId` is denormalised from the agent (plan 6.1: every tenant-scoped table has a non-null
 * `customerId`). An account can be bound to an agent once while the binding is not revoked (partial unique index).
 */
export class StudioMigrations1791700300000 implements MigrationInterface {
	name = 'StudioMigrations1791700300000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "authorityGrant" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "agentId" uuid NOT NULL, "customerId" uuid NOT NULL, "grantType" character varying(32) NOT NULL, "issuedCredentialId" character varying, "statusListId" character varying, "statusIndex" integer, "expiresAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_authorityGrant_id" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(`CREATE INDEX "IDX_authorityGrant_agentId" ON "authorityGrant" ("agentId")`);
		await queryRunner.query(`CREATE INDEX "IDX_authorityGrant_customerId" ON "authorityGrant" ("customerId")`);
		await queryRunner.query(
			`ALTER TABLE "authorityGrant" ADD CONSTRAINT "FK_authorityGrant_agentId" FOREIGN KEY ("agentId") REFERENCES "agent"("agentId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityGrant" ADD CONSTRAINT "FK_authorityGrant_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityGrant" ADD CONSTRAINT "FK_authorityGrant_issuedCredentialId" FOREIGN KEY ("issuedCredentialId") REFERENCES "issuedCredential"("issuedCredentialId") ON DELETE SET NULL ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "authorityGrant" ADD CONSTRAINT "FK_authorityGrant_statusListId" FOREIGN KEY ("statusListId") REFERENCES "statusRegistry"("registryId") ON DELETE SET NULL ON UPDATE NO ACTION`
		);

		await queryRunner.query(
			`CREATE TABLE "paymentAddressBinding" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "agentId" uuid NOT NULL, "customerId" uuid NOT NULL, "account" text NOT NULL, "issuedCredentialId" character varying, "statusListId" character varying, "statusIndex" integer, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_paymentAddressBinding_id" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_paymentAddressBinding_agentId_account_active" ON "paymentAddressBinding" ("agentId", "account") WHERE "revokedAt" IS NULL`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_paymentAddressBinding_customerId" ON "paymentAddressBinding" ("customerId")`
		);
		await queryRunner.query(
			`ALTER TABLE "paymentAddressBinding" ADD CONSTRAINT "FK_paymentAddressBinding_agentId" FOREIGN KEY ("agentId") REFERENCES "agent"("agentId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "paymentAddressBinding" ADD CONSTRAINT "FK_paymentAddressBinding_customerId" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "paymentAddressBinding" ADD CONSTRAINT "FK_paymentAddressBinding_issuedCredentialId" FOREIGN KEY ("issuedCredentialId") REFERENCES "issuedCredential"("issuedCredentialId") ON DELETE SET NULL ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "paymentAddressBinding" ADD CONSTRAINT "FK_paymentAddressBinding_statusListId" FOREIGN KEY ("statusListId") REFERENCES "statusRegistry"("registryId") ON DELETE SET NULL ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP TABLE "paymentAddressBinding"`);
		await queryRunner.query(`DROP TABLE "authorityGrant"`);
	}
}
