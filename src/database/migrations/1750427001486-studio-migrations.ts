import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1750427001486 implements MigrationInterface {
	name = 'StudioMigrations1750427001486';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "subscription" DROP CONSTRAINT "FK_4fb9a7c3c5b5fecf58989794dcc"`);
		await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "logToRoleIds" SET DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "payment" ALTER COLUMN "resourceId" DROP NOT NULL`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "payment" ALTER COLUMN "resourceId" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "logToRoleIds" SET DEFAULT ARRAY[]`);
		await queryRunner.query(
			`ALTER TABLE "subscription" ADD CONSTRAINT "FK_4fb9a7c3c5b5fecf58989794dcc" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}
}
