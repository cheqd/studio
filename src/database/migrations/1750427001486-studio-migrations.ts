import { MigrationInterface, QueryRunner } from "typeorm";

export class StudioMigrations1750427001486 implements MigrationInterface {
    name = 'StudioMigrations1750427001486'

    public async up(queryRunner: QueryRunner): Promise<void> {
        
        await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "logToRoleIds" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "payment" ALTER COLUMN "resourceId" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment" ALTER COLUMN "resourceId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "role" ALTER COLUMN "logToRoleIds" SET DEFAULT ARRAY[]`);
    }

}
