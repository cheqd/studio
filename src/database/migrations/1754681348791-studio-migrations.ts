import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1754681348791 implements MigrationInterface {
	name = 'StudioMigrations1754681348791';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "key" DROP CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47"`);
		await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_a18070374cfe7e2bc06b9518c11"`);
		await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_63bf73143b285c727bd046e6710"`);
		await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df"`);
		await queryRunner.query(`ALTER TABLE "identifier" DROP CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5"`);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_3a460e48557bad5564504ddad90"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_d796bcde5e182136266b2a6b72c"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_ef88f92988763fee884c37db63b"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_a13b5cf828c669e61faf489c182"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_1c111357e73db91a08525914b59"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_8ae8195a94b667b185d2c023e33"`
		);
		await queryRunner.query(`DROP INDEX "public"."IDX_apiKey_c5fdf6760b38094e0905ac85e4"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_c3b760612b992bc75511d74f6a"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_32d9cee791ee1139f29fd94b5c"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_9dc4cc025ec7163ec5ca919d14"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_1f64a9d131c0f7245a90deee93"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "customerId"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "createdAt"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "updatedAt"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "publicKeyAlias"`);
		await queryRunner.query(`ALTER TABLE "claim" DROP COLUMN "customerId"`);
		await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "customerId"`);
		await queryRunner.query(`ALTER TABLE "key" ADD "privateKeyHex" character varying`);
		await queryRunner.query(`CREATE TYPE "public"."resource_namespace_enum" AS ENUM('testnet', 'mainnet')`);
		await queryRunner.query(`ALTER TABLE "resource" ADD "namespace" "public"."resource_namespace_enum" NOT NULL`);
		await queryRunner.query(`ALTER TABLE "key" ADD "publicKeyAlias" text`);
		await queryRunner.query(`ALTER TABLE "key" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
		await queryRunner.query(`ALTER TABLE "key" ADD "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()`);
		await queryRunner.query(`ALTER TABLE "key" ADD "customerId" uuid`);
		await queryRunner.query(`ALTER TABLE "identifier" ADD "customerId" uuid`);
		await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_3d494b79143de3d0e793883e351"`);
		await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "value" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "credentialHash" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "credential" DROP CONSTRAINT "FK_123d0977e0976565ee0932c0b9e"`);
		await queryRunner.query(`ALTER TABLE "credential" ALTER COLUMN "issuerDid" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "presentation" ALTER COLUMN "issuanceDate" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "message" ALTER COLUMN "type" SET NOT NULL`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c5fdf6760b38094e0905ac85e4" ON "apiKey" ("fingerprint") `);
		await queryRunner.query(
			`CREATE INDEX "IDX_05b1eda0f6f5400cb173ebbc08" ON "presentation_verifier_identifier" ("presentationHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_3a460e48557bad5564504ddad9" ON "presentation_verifier_identifier" ("identifierDid") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_d796bcde5e182136266b2a6b72" ON "presentation_credentials_credential" ("presentationHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ef88f92988763fee884c37db63" ON "presentation_credentials_credential" ("credentialHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_7e7094f2cd6e5ec93914ac5138" ON "message_presentations_presentation" ("messageId") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_a13b5cf828c669e61faf489c18" ON "message_presentations_presentation" ("presentationHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_1c111357e73db91a08525914b5" ON "message_credentials_credential" ("messageId") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_8ae8195a94b667b185d2c023e3" ON "message_credentials_credential" ("credentialHash") `
		);
		await queryRunner.query(
			`ALTER TABLE "key" ADD CONSTRAINT "FK_3f40a9459b53adf1729dbd3b787" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "service" ADD CONSTRAINT "FK_e16e0280d906951809f95dd09f1" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "claim" ADD CONSTRAINT "FK_3d494b79143de3d0e793883e351" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "credential" ADD CONSTRAINT "FK_123d0977e0976565ee0932c0b9e" FOREIGN KEY ("issuerDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message" ADD CONSTRAINT "FK_63bf73143b285c727bd046e6710" FOREIGN KEY ("fromDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message" ADD CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df" FOREIGN KEY ("toDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "key" ADD CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "identifier" ADD CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE CASCADE`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_3a460e48557bad5564504ddad90" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_d796bcde5e182136266b2a6b72c" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE CASCADE`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_ef88f92988763fee884c37db63b" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_a13b5cf828c669e61faf489c182" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_1c111357e73db91a08525914b59" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE`
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_8ae8195a94b667b185d2c023e33" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_8ae8195a94b667b185d2c023e33"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_1c111357e73db91a08525914b59"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_a13b5cf828c669e61faf489c182"`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_ef88f92988763fee884c37db63b"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_d796bcde5e182136266b2a6b72c"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_3a460e48557bad5564504ddad90"`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086"`
		);
		await queryRunner.query(`ALTER TABLE "identifier" DROP CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5"`);
		await queryRunner.query(`ALTER TABLE "key" DROP CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47"`);
		await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df"`);
		await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_63bf73143b285c727bd046e6710"`);
		await queryRunner.query(`ALTER TABLE "credential" DROP CONSTRAINT "FK_123d0977e0976565ee0932c0b9e"`);
		await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_3d494b79143de3d0e793883e351"`);
		await queryRunner.query(`ALTER TABLE "service" DROP CONSTRAINT "FK_e16e0280d906951809f95dd09f1"`);
		await queryRunner.query(`ALTER TABLE "key" DROP CONSTRAINT "FK_3f40a9459b53adf1729dbd3b787"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_8ae8195a94b667b185d2c023e3"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_1c111357e73db91a08525914b5"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_a13b5cf828c669e61faf489c18"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_7e7094f2cd6e5ec93914ac5138"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_ef88f92988763fee884c37db63"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_d796bcde5e182136266b2a6b72"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_3a460e48557bad5564504ddad9"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_05b1eda0f6f5400cb173ebbc08"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_c5fdf6760b38094e0905ac85e4"`);
		await queryRunner.query(`ALTER TABLE "message" ALTER COLUMN "type" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "presentation" ALTER COLUMN "issuanceDate" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "credential" ALTER COLUMN "issuerDid" SET NOT NULL`);
		await queryRunner.query(
			`ALTER TABLE "credential" ADD CONSTRAINT "FK_123d0977e0976565ee0932c0b9e" FOREIGN KEY ("issuerDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "credentialHash" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "value" SET NOT NULL`);
		await queryRunner.query(
			`ALTER TABLE "claim" ADD CONSTRAINT "FK_3d494b79143de3d0e793883e351" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "customerId"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "customerId"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "updatedAt"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "createdAt"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "publicKeyAlias"`);
		await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "namespace"`);
		await queryRunner.query(`DROP TYPE "public"."resource_namespace_enum"`);
		await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "privateKeyHex"`);
		await queryRunner.query(`ALTER TABLE "identifier" ADD "customerId" uuid`);
		await queryRunner.query(`ALTER TABLE "claim" ADD "customerId" uuid`);
		await queryRunner.query(`ALTER TABLE "key" ADD "publicKeyAlias" text`);
		await queryRunner.query(`ALTER TABLE "key" ADD "updatedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "key" ADD "createdAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "key" ADD "customerId" uuid`);
		await queryRunner.query(
			`CREATE INDEX "IDX_1f64a9d131c0f7245a90deee93" ON "message_credentials_credential" ("messageId", "credentialHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_9dc4cc025ec7163ec5ca919d14" ON "message_presentations_presentation" ("messageId", "presentationHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_32d9cee791ee1139f29fd94b5c" ON "presentation_credentials_credential" ("presentationHash", "credentialHash") `
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_c3b760612b992bc75511d74f6a" ON "presentation_verifier_identifier" ("presentationHash", "identifierDid") `
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_apiKey_c5fdf6760b38094e0905ac85e4" ON "apiKey" ("fingerprint") `
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_8ae8195a94b667b185d2c023e33" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_1c111357e73db91a08525914b59" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_a13b5cf828c669e61faf489c182" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_ef88f92988763fee884c37db63b" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_d796bcde5e182136266b2a6b72c" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_3a460e48557bad5564504ddad90" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "identifier" ADD CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message" ADD CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df" FOREIGN KEY ("toDid") REFERENCES "identifier"("did") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "message" ADD CONSTRAINT "FK_63bf73143b285c727bd046e6710" FOREIGN KEY ("fromDid") REFERENCES "identifier"("did") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "claim" ADD CONSTRAINT "FK_a18070374cfe7e2bc06b9518c11" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "key" ADD CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}
}
