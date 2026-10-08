import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1791500000000 implements MigrationInterface {
	name = 'StudioMigrations1791500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "faucetRequest" ("faucetRequestId" uuid NOT NULL DEFAULT uuid_generate_v4(), "address" text NOT NULL, "amountNcheq" bigint NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "customerId" uuid NOT NULL, CONSTRAINT "PK_7a6c79df9596b24bdccfeeb6eb1" PRIMARY KEY ("faucetRequestId"))`
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_aa091848bbf777ec704825281f" ON "faucetRequest" ("customerId", "createdAt")`
		);
		await queryRunner.query(
			`ALTER TABLE "faucetRequest" ADD CONSTRAINT "FK_55b0239dcbc50483b22446dcee9" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "faucetRequest" DROP CONSTRAINT "FK_55b0239dcbc50483b22446dcee9"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_aa091848bbf777ec704825281f"`);
		await queryRunner.query(`DROP TABLE "faucetRequest"`);
	}
}
