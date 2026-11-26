import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1791600000000 implements MigrationInterface {
	name = 'StudioMigrations1791600000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Deliberately no FK to "customer": this table must survive the customer row it describes being
		// deleted, so a later signup with the same email can be blocked from a fresh free trial.
		await queryRunner.query(
			`CREATE TABLE "deletedAccountRecord" ("email" text NOT NULL, "previousCustomerId" text NOT NULL, "stripeCustomerId" text, "deletedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_deletedAccountRecord_email" PRIMARY KEY ("email"))`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "deletedAccountRecord"`);
	}
}
