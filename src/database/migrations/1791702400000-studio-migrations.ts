import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records how each operation's caller authenticated (`api-key`, `portal`, `id-token`, `m2m`, `swagger-ui`), so usage can
 * be split between the portal and direct API use. Expand-only: one nullable column on `operation`; existing rows stay
 * null and nothing is rewritten. Reversible: `down` drops the column.
 */
export class StudioMigrations1791702400000 implements MigrationInterface {
	name = 'StudioMigrations1791702400000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "operation" ADD COLUMN "authMethod" character varying(16)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "operation" DROP COLUMN "authMethod"`);
	}
}
