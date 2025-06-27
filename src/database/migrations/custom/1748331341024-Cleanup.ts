import { MigrationInterface, QueryRunner } from 'typeorm';

export class Cleanup1748331341024 implements MigrationInterface {
	name = 'Cleanup1748331341024';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// manual changes first
		await queryRunner.query(
			`DELETE FROM "service" WHERE "identifierDid" IS NOT NULL AND "identifierDid" NOT IN (SELECT "did" FROM "identifier");`
		); // Drop rows without identifierDid records
		await queryRunner.query(`UPDATE key SET "createdAt" = '1970-01-01 00:00:00+00' WHERE "createdAt" IS NULL;`); // Add missing createAt timestamps

		await queryRunner.query(`ALTER TABLE "coin" ALTER COLUMN "coinId" SET DEFAULT uuid_generate_v4();`); // Fixes issue with TypeORM - otherwise, it will force coin.coinId recreation every time.
		await queryRunner.query(`ALTER TABLE "resource" ALTER COLUMN "kid" TYPE character varying;`); // Fixes issue with TypeORM - otherwise, it will force resource.kid recreation every time.
		await queryRunner.query(`ALTER TABLE "resource" ALTER COLUMN "identifierDid" TYPE character varying;`); // Fixes issue with TypeORM - otherwise, it will force resource.identifierDid recreation every time.
		await queryRunner.query(`ALTER TABLE "paymentAccount" ALTER COLUMN "kid" TYPE character varying;`); // Fixes issue with TypeORM - otherwise, it will force paymentAccount.kid recreation every time.
		// End of manual changes

		// await queryRunner.query(`ALTER TABLE "key" DROP CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47"`);
		// await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_a18070374cfe7e2bc06b9518c11"`);
		// await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_63bf73143b285c727bd046e6710"`);
		// await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df"`);
		// await queryRunner.query(`ALTER TABLE "identifier" DROP CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5"`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_3a460e48557bad5564504ddad90"`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086"`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_ef88f92988763fee884c37db63b"`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_d796bcde5e182136266b2a6b72c"`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_a13b5cf828c669e61faf489c182"`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f"`);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_8ae8195a94b667b185d2c023e33"`);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_1c111357e73db91a08525914b59"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_apiKey_c5fdf6760b38094e0905ac85e4"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_c3b760612b992bc75511d74f6a"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_32d9cee791ee1139f29fd94b5c"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_9dc4cc025ec7163ec5ca919d14"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_1f64a9d131c0f7245a90deee93"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "customerId"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "createdAt"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "updatedAt"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "publicKeyAlias"`);
		// await queryRunner.query(`ALTER TABLE "claim" DROP COLUMN "customerId"`);
		// await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "customerId"`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "privateKeyHex" character varying`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "publicKeyAlias" text`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "customerId" uuid`);
		// await queryRunner.query(`ALTER TABLE "identifier" ADD "customerId" uuid`);
		// await queryRunner.query(`ALTER TABLE "claim" ADD "customerId" uuid`);
		// await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_3d494b79143de3d0e793883e351"`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "value" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "credentialHash" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "credential" DROP CONSTRAINT "FK_123d0977e0976565ee0932c0b9e"`);
		// await queryRunner.query(`ALTER TABLE "credential" ALTER COLUMN "issuerDid" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "presentation" ALTER COLUMN "issuanceDate" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "message" ALTER COLUMN "type" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "logToRoleIds" SET DEFAULT '{}'`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP CONSTRAINT "FK_501c5e72ffa6b86715e130c0398"`); // reference to identifier table
		// await queryRunner.query(`ALTER TABLE "resource" DROP CONSTRAINT "FK_30219c518aa3a0f77fa9f029159"`); // reference to key table

		// Custom change of previousVersionId and nextVersionId from text to uuid
		await queryRunner.query(`ALTER TABLE "resource" ALTER COLUMN "previousVersionId" DROP NOT NULL;`);
		await queryRunner.query(`ALTER TABLE "resource" ALTER COLUMN "nextVersionId" DROP NOT NULL;`);

		await queryRunner.query(
			`ALTER TABLE "resource" ALTER COLUMN "previousVersionId" TYPE uuid USING NULLIF(TRIM("previousVersionId"), '')::uuid;`
		);
		await queryRunner.query(
			`ALTER TABLE "resource" ALTER COLUMN "nextVersionId" TYPE uuid USING NULLIF(TRIM("nextVersionId"), '')::uuid;`
		);
		// End of custom changes

		// await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "identifierDid"`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD "identifierDid" character varying NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "kid"`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD "kid" character varying NOT NULL`);

		await queryRunner.query(`ALTER TABLE "apiKey" ALTER COLUMN "revoked" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "apiKey" ALTER COLUMN "revoked" SET DEFAULT false`);

		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "value" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "credentialHash" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "paymentAccount" DROP CONSTRAINT "FK_2ba36b7ed28625ce122c5b05385"`); // addressed at the start of the script
		// await queryRunner.query(`ALTER TABLE "paymentAccount" DROP COLUMN "kid"`); // addressed at the start of the script
		// await queryRunner.query(`ALTER TABLE "paymentAccount" ADD "kid" character varying NOT NULL`); // addressed at the start of the script
		// await queryRunner.query(`ALTER TABLE "operation" DROP CONSTRAINT "FK_9434f07fb815bfb5c67d5a7f7df"`); // addressed at the start of the script
		// await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "FK_ee4feb6abfb5aa191c20e78dd83"`); // addressed at the start of the script
		// await queryRunner.query(`ALTER TABLE "coin" ALTER COLUMN "coinId" SET DEFAULT uuid_generate_v4()`); // addressed at the start of the script

		// Custom logic here - instead of recreating the enum and dropping the column, we're just going to change the type
		await queryRunner.query(
			`ALTER TABLE "payment" ALTER COLUMN "namespace" TYPE "public"."paymentAccount_namespace_enum" USING "namespace"::"public"."paymentAccount_namespace_enum";`
		);
		// End of custom logic

		// await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c5fdf6760b38094e0905ac85e4" ON "apiKey" ("fingerprint") `);
		// await queryRunner.query(`CREATE INDEX "IDX_05b1eda0f6f5400cb173ebbc08" ON "presentation_verifier_identifier" ("presentationHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_3a460e48557bad5564504ddad9" ON "presentation_verifier_identifier" ("identifierDid") `);
		// await queryRunner.query(`CREATE INDEX "IDX_d796bcde5e182136266b2a6b72" ON "presentation_credentials_credential" ("presentationHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_ef88f92988763fee884c37db63" ON "presentation_credentials_credential" ("credentialHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_7e7094f2cd6e5ec93914ac5138" ON "message_presentations_presentation" ("messageId") `);
		// await queryRunner.query(`CREATE INDEX "IDX_a13b5cf828c669e61faf489c18" ON "message_presentations_presentation" ("presentationHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_1c111357e73db91a08525914b5" ON "message_credentials_credential" ("messageId") `);
		// await queryRunner.query(`CREATE INDEX "IDX_8ae8195a94b667b185d2c023e3" ON "message_credentials_credential" ("credentialHash") `);
		// await queryRunner.query(`ALTER TABLE "key" ADD CONSTRAINT "FK_3f40a9459b53adf1729dbd3b787" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "service" ADD CONSTRAINT "FK_e16e0280d906951809f95dd09f1" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "claim" ADD CONSTRAINT "FK_3d494b79143de3d0e793883e351" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "credential" ADD CONSTRAINT "FK_123d0977e0976565ee0932c0b9e" FOREIGN KEY ("issuerDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_63bf73143b285c727bd046e6710" FOREIGN KEY ("fromDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df" FOREIGN KEY ("toDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD CONSTRAINT "FK_501c5e72ffa6b86715e130c0398" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD CONSTRAINT "FK_30219c518aa3a0f77fa9f029159" FOREIGN KEY ("kid") REFERENCES "key"("kid") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "key" ADD CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "identifier" ADD CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "claim" ADD CONSTRAINT "FK_a18070374cfe7e2bc06b9518c11" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "paymentAccount" ADD CONSTRAINT "FK_2ba36b7ed28625ce122c5b05385" FOREIGN KEY ("kid") REFERENCES "key"("kid") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "operation" ADD CONSTRAINT "FK_9434f07fb815bfb5c67d5a7f7df" FOREIGN KEY ("defaultFee") REFERENCES "coin"("coinId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "FK_85d5d6750c1c60288cfe9fadbfa" FOREIGN KEY ("fee") REFERENCES "coin"("coinId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "FK_ee4feb6abfb5aa191c20e78dd83" FOREIGN KEY ("amount") REFERENCES "coin"("coinId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE CASCADE`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_3a460e48557bad5564504ddad90" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE NO ACTION ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_d796bcde5e182136266b2a6b72c" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE CASCADE`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_ef88f92988763fee884c37db63b" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE NO ACTION ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_a13b5cf828c669e61faf489c182" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE NO ACTION ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_1c111357e73db91a08525914b59" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_8ae8195a94b667b185d2c023e33" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE NO ACTION ON UPDATE NO ACTION`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// We're going to disable rollback here, since it's not applicable anyway.
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_8ae8195a94b667b185d2c023e33"`);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" DROP CONSTRAINT "FK_1c111357e73db91a08525914b59"`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_a13b5cf828c669e61faf489c182"`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" DROP CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f"`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_ef88f92988763fee884c37db63b"`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" DROP CONSTRAINT "FK_d796bcde5e182136266b2a6b72c"`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_3a460e48557bad5564504ddad90"`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" DROP CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086"`);
		// await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "FK_ee4feb6abfb5aa191c20e78dd83"`);
		// await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "FK_85d5d6750c1c60288cfe9fadbfa"`);
		// await queryRunner.query(`ALTER TABLE "operation" DROP CONSTRAINT "FK_9434f07fb815bfb5c67d5a7f7df"`);
		// await queryRunner.query(`ALTER TABLE "paymentAccount" DROP CONSTRAINT "FK_2ba36b7ed28625ce122c5b05385"`);
		// await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_a18070374cfe7e2bc06b9518c11"`);
		// await queryRunner.query(`ALTER TABLE "identifier" DROP CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47"`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP CONSTRAINT "FK_30219c518aa3a0f77fa9f029159"`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP CONSTRAINT "FK_501c5e72ffa6b86715e130c0398"`);
		// await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df"`);
		// await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_63bf73143b285c727bd046e6710"`);
		// await queryRunner.query(`ALTER TABLE "credential" DROP CONSTRAINT "FK_123d0977e0976565ee0932c0b9e"`);
		// await queryRunner.query(`ALTER TABLE "claim" DROP CONSTRAINT "FK_3d494b79143de3d0e793883e351"`);
		// await queryRunner.query(`ALTER TABLE "service" DROP CONSTRAINT "FK_e16e0280d906951809f95dd09f1"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP CONSTRAINT "FK_3f40a9459b53adf1729dbd3b787"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_8ae8195a94b667b185d2c023e3"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_1c111357e73db91a08525914b5"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_a13b5cf828c669e61faf489c18"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_7e7094f2cd6e5ec93914ac5138"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_ef88f92988763fee884c37db63"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_d796bcde5e182136266b2a6b72"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_3a460e48557bad5564504ddad9"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_05b1eda0f6f5400cb173ebbc08"`);
		// await queryRunner.query(`DROP INDEX "public"."IDX_c5fdf6760b38094e0905ac85e4"`);
		// await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "namespace"`);
		// await queryRunner.query(`ALTER TABLE "payment" ADD "namespace" text NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "coin" ALTER COLUMN "coinId" DROP DEFAULT`);
		// await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "FK_ee4feb6abfb5aa191c20e78dd83" FOREIGN KEY ("amount") REFERENCES "coin"("coinId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "operation" ADD CONSTRAINT "FK_9434f07fb815bfb5c67d5a7f7df" FOREIGN KEY ("defaultFee") REFERENCES "coin"("coinId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "paymentAccount" DROP COLUMN "kid"`);
		// await queryRunner.query(`ALTER TABLE "paymentAccount" ADD "kid" text NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "paymentAccount" ADD CONSTRAINT "FK_2ba36b7ed28625ce122c5b05385" FOREIGN KEY ("kid") REFERENCES "key"("kid") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "credentialHash" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "value" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "apiKey" ALTER COLUMN "revoked" DROP DEFAULT`);
		// await queryRunner.query(`ALTER TABLE "apiKey" ALTER COLUMN "revoked" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "kid"`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD "kid" text NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "identifierDid"`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD "identifierDid" text NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "nextVersionId"`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD "nextVersionId" text NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "previousVersionId"`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD "previousVersionId" text NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD CONSTRAINT "FK_30219c518aa3a0f77fa9f029159" FOREIGN KEY ("kid") REFERENCES "key"("kid") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "resource" ADD CONSTRAINT "FK_501c5e72ffa6b86715e130c0398" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "logToRoleIds" SET DEFAULT ARRAY[]`);
		// await queryRunner.query(`ALTER TABLE "message" ALTER COLUMN "type" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "presentation" ALTER COLUMN "issuanceDate" DROP NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "credential" ALTER COLUMN "issuerDid" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "credential" ADD CONSTRAINT "FK_123d0977e0976565ee0932c0b9e" FOREIGN KEY ("issuerDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "credentialHash" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "claim" ALTER COLUMN "value" SET NOT NULL`);
		// await queryRunner.query(`ALTER TABLE "claim" ADD CONSTRAINT "FK_3d494b79143de3d0e793883e351" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "claim" DROP COLUMN "customerId"`);
		// await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "customerId"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "customerId"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "updatedAt"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "createdAt"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "publicKeyAlias"`);
		// await queryRunner.query(`ALTER TABLE "key" DROP COLUMN "privateKeyHex"`);
		// await queryRunner.query(`ALTER TABLE "identifier" ADD "customerId" uuid`);
		// await queryRunner.query(`ALTER TABLE "claim" ADD "customerId" uuid`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "publicKeyAlias" text`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "updatedAt" TIMESTAMP WITH TIME ZONE`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "createdAt" TIMESTAMP WITH TIME ZONE`);
		// await queryRunner.query(`ALTER TABLE "key" ADD "customerId" uuid`);
		// await queryRunner.query(`CREATE INDEX "IDX_1f64a9d131c0f7245a90deee93" ON "message_credentials_credential" ("messageId", "credentialHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_9dc4cc025ec7163ec5ca919d14" ON "message_presentations_presentation" ("messageId", "presentationHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_32d9cee791ee1139f29fd94b5c" ON "presentation_credentials_credential" ("presentationHash", "credentialHash") `);
		// await queryRunner.query(`CREATE INDEX "IDX_c3b760612b992bc75511d74f6a" ON "presentation_verifier_identifier" ("presentationHash", "identifierDid") `);
		// await queryRunner.query(`CREATE UNIQUE INDEX "IDX_apiKey_c5fdf6760b38094e0905ac85e4" ON "apiKey" ("fingerprint") `);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_1c111357e73db91a08525914b59" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message_credentials_credential" ADD CONSTRAINT "FK_8ae8195a94b667b185d2c023e33" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message_presentations_presentation" ADD CONSTRAINT "FK_a13b5cf828c669e61faf489c182" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_d796bcde5e182136266b2a6b72c" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "presentation_credentials_credential" ADD CONSTRAINT "FK_ef88f92988763fee884c37db63b" FOREIGN KEY ("credentialHash") REFERENCES "credential"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086" FOREIGN KEY ("presentationHash") REFERENCES "presentation"("hash") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "presentation_verifier_identifier" ADD CONSTRAINT "FK_3a460e48557bad5564504ddad90" FOREIGN KEY ("identifierDid") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "identifier" ADD CONSTRAINT "FK_92ed3e888d5d60e8cf4255563e5" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df" FOREIGN KEY ("toDid") REFERENCES "identifier"("did") ON DELETE NO ACTION ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_63bf73143b285c727bd046e6710" FOREIGN KEY ("fromDid") REFERENCES "identifier"("did") ON DELETE NO ACTION ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "claim" ADD CONSTRAINT "FK_a18070374cfe7e2bc06b9518c11" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// await queryRunner.query(`ALTER TABLE "key" ADD CONSTRAINT "FK_6025cb4f8a7b714e138d8531f47" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}
}
