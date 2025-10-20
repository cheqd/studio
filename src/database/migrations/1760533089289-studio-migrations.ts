import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1760533089289 implements MigrationInterface {
	name = 'StudioMigrations1760533089289';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "issuedCredential" ("issuedCredentialId" character varying NOT NULL, "providerId" character varying NOT NULL, "providerCredentialId" character varying, "issuerId" character varying, "subjectId" character varying, "format" text NOT NULL, "type" json NOT NULL, "status" text NOT NULL DEFAULT 'issued', "statusUpdatedAt" TIMESTAMP WITH TIME ZONE, "metadata" json, "credentialStatus" json, "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deprecated" boolean NOT NULL DEFAULT false, "customerId" uuid NOT NULL, CONSTRAINT "PK_8c349f31da1e65cb1d2e2d45eed" PRIMARY KEY ("issuedCredentialId"))`
		);
		await queryRunner.query(
			`ALTER TABLE "issuedCredential" ADD CONSTRAINT "FK_7d767433d76851e3e78561d8e4c" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "issuedCredential" ADD CONSTRAINT "FK_66a8712fa70886764c7003ea9c8" FOREIGN KEY ("providerId") REFERENCES "credentialProvider"("providerId") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(`
			CREATE INDEX "IDX_issuedCredential_customerId" ON "issuedCredential" ("customerId");
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_issuedCredential_providerId" ON "issuedCredential" ("providerId");
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_issuedCredential_status" ON "issuedCredential" ("status");
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_issuedCredential_issuerId" ON "issuedCredential" ("issuerId");
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_issuedCredential_subjectId" ON "issuedCredential" ("subjectId");
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issuedCredential_subjectId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issuedCredential_issuerId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issuedCredential_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issuedCredential_providerId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issuedCredential_customerId"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP CONSTRAINT "FK_66a8712fa70886764c7003ea9c8"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP CONSTRAINT "FK_7d767433d76851e3e78561d8e4c"`);
		await queryRunner.query(`DROP TABLE "issuedCredential"`);
	}
}
