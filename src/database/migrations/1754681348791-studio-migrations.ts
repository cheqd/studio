import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1754681348791 implements MigrationInterface {
	name = 'StudioMigrations1754681348791';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE TYPE "public"."resource_namespace_enum" AS ENUM('testnet', 'mainnet')`);
		await queryRunner.query(`ALTER TABLE "resource" ADD "namespace" "public"."resource_namespace_enum"`);

		// Populate column based on linked identifier.did
		await queryRunner.query(`
            UPDATE "resource" r
            SET "namespace" = CASE
                WHEN split_part(i.did, ':', 3) = 'testnet' THEN 'testnet'::resource_namespace_enum
                WHEN split_part(i.did, ':', 3) = 'mainnet' THEN 'mainnet'::resource_namespace_enum
                ELSE NULL
            END
            FROM "identifier" i
            WHERE r."identifierDid" = i."did"
        `);

		// Set column as NOT NULL
		await queryRunner.query(`
            ALTER TABLE "resource" ALTER COLUMN "namespace" SET NOT NULL
        `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "namespace"`);
		await queryRunner.query(`DROP TYPE "public"."resource_namespace_enum"`);
	}
}
