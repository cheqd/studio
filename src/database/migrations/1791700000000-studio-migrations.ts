import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1791700000000 implements MigrationInterface {
	name = 'StudioMigrations1791700000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE TABLE "featureFlag" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "flagKey" text NOT NULL, "customerId" uuid, "route" text, "value" jsonb NOT NULL, "updatedBy" text NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_featureFlag_id" PRIMARY KEY ("id"))`
		);
		// Unique (flagKey, customerId, route), with NULL customerId (global) and NULL route (all routes) counted as equal.
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_featureFlag_key_customer_route" ON "featureFlag" ("flagKey", COALESCE("customerId"::text, ''), COALESCE("route", ''))`
		);
		await queryRunner.query(
			`ALTER TABLE "featureFlag" ADD CONSTRAINT "FK_featureFlag_customer" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "featureFlag" DROP CONSTRAINT "FK_featureFlag_customer"`);
		await queryRunner.query(`DROP INDEX "public"."UQ_featureFlag_key_customer_route"`);
		await queryRunner.query(`DROP TABLE "featureFlag"`);
	}
}
