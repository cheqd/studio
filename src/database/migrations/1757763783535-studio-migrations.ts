import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1757763783535 implements MigrationInterface {
	name = 'StudioMigrations1757763783535';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "credentialProvider" ("providerId" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "providerType" character varying NOT NULL, "supportedFormats" json NOT NULL DEFAULT '[]', "supportedProtocols" json NOT NULL DEFAULT '[]', "metadata" json NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ec7823cec7e4cff1ac995b17ef2" PRIMARY KEY ("providerId"))`
		);
		await queryRunner.query(
			`CREATE TABLE "providerConfiguration" ("configId" uuid NOT NULL DEFAULT uuid_generate_v4(), "providerId" character varying NOT NULL, "tenantId" character varying NOT NULL, "encryptedApiKey" text NOT NULL, "apiEndpoint" text NOT NULL, "webhookUrl" text, "validated" boolean NOT NULL DEFAULT false, "validatedAt" TIMESTAMP WITH TIME ZONE, "active" boolean NOT NULL DEFAULT false, "defaultSettings" json, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE, "customerId" uuid NOT NULL, CONSTRAINT "PK_1d01143cbf3d1bd2dea19d96718" PRIMARY KEY ("configId"))`
		);
		await queryRunner.query(
			`ALTER TABLE "providerConfiguration" ADD CONSTRAINT "FK_dab81306899652ca64119b40aaf" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "providerConfiguration" ADD CONSTRAINT "FK_e0e1d13d32a333f16891cfad86b" FOREIGN KEY ("providerId") REFERENCES "credentialProvider"("providerId") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_provider_customer" ON "providerConfiguration" ("providerId", "customerId")`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "providerConfiguration" DROP CONSTRAINT "FK_e0e1d13d32a333f16891cfad86b"`);
		await queryRunner.query(`ALTER TABLE "providerConfiguration" DROP CONSTRAINT "FK_dab81306899652ca64119b40aaf"`);
		await queryRunner.query(`DROP INDEX "IDX_provider_customer"`);
		await queryRunner.query(`DROP TABLE "credentialProvider"`);
		await queryRunner.query(`DROP TABLE "providerConfiguration"`);
	}
}
