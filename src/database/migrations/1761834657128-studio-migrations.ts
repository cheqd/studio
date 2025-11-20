import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1761834657128 implements MigrationInterface {
	name = 'StudioMigrations1761834657128';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "statusRegistry" ("registryId" character varying NOT NULL, "uri" character varying NOT NULL, "prev_uri" character varying, "next_uri" character varying, "registryType" text NOT NULL, "storageType" text NOT NULL, "registryName" character varying NOT NULL, "encrypted" boolean NOT NULL DEFAULT false, "credentialCategory" character varying NOT NULL, "version" integer NOT NULL DEFAULT '0', "registrySize" integer NOT NULL DEFAULT '131072', "writeCursor" integer NOT NULL DEFAULT '0', "threshold_percentage" integer NOT NULL DEFAULT '80', "state" character varying NOT NULL, "sealedAt" TIMESTAMP WITH TIME ZONE, "sealedCommitment" character varying, "metadata" json, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deprecated" boolean NOT NULL DEFAULT false, "issuerId" character varying NOT NULL, "customerId" uuid NOT NULL, CONSTRAINT "PK_a2471963ef3e3203aa53d16e62a" PRIMARY KEY ("registryId"))`
		);
		await queryRunner.query(
			`ALTER TABLE "statusRegistry" ADD CONSTRAINT "FK_4805f0100b6a4a8577895e7e4c4" FOREIGN KEY ("issuerId") REFERENCES "identifier"("did") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "statusRegistry" ADD CONSTRAINT "FK_c35b641a0cb9520ace29d6fe634" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "statusRegistry" DROP CONSTRAINT "FK_c35b641a0cb9520ace29d6fe634"`);
		await queryRunner.query(`ALTER TABLE "statusRegistry" DROP CONSTRAINT "FK_4805f0100b6a4a8577895e7e4c4"`);
		await queryRunner.query(`DROP TABLE "statusRegistry"`);
	}
}
