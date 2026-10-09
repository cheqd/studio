import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1791500000002 implements MigrationInterface {
	name = 'StudioMigrations1791500000002';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "faucetRequest" ALTER COLUMN "createdAt" SET DEFAULT now()`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "faucetRequest" ALTER COLUMN "createdAt" DROP DEFAULT`);
	}
}
