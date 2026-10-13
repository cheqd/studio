import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1791500000001 implements MigrationInterface {
	name = 'StudioMigrations1791500000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "faucetRequest" ADD "status" text NOT NULL DEFAULT 'completed'`);
		await queryRunner.query(
			`ALTER TABLE "faucetRequest" ADD CONSTRAINT "CHK_faucetRequest_status" CHECK ("status" IN ('pending', 'completed', 'unknown', 'abandoned'))`
		);
		await queryRunner.query(`ALTER TABLE "faucetRequest" ADD "completedAt" TIMESTAMP WITH TIME ZONE`);
		// Rows that already exist were recorded after the faucet call, so they are completed
		await queryRunner.query(`UPDATE "faucetRequest" SET "completedAt" = "createdAt" WHERE "completedAt" IS NULL`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "faucetRequest" DROP COLUMN "completedAt"`);
		await queryRunner.query(`ALTER TABLE "faucetRequest" DROP CONSTRAINT "CHK_faucetRequest_status"`);
		await queryRunner.query(`ALTER TABLE "faucetRequest" DROP COLUMN "status"`);
	}
}
