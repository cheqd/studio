import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `customer.credoTenantId`.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1, 6.2 and 6.4).
 * Expand-only safety: a nullable column with no default is a metadata-only change in Postgres 11 and later, and
 * existing inserts that omit it keep working. The unique index that the plan asks for is created in the later
 * index migration (1791701100000), so this migration never builds an index on `customer`.
 */
export class StudioMigrations1791700500000 implements MigrationInterface {
	name = 'StudioMigrations1791700500000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "customer" ADD COLUMN "credoTenantId" character varying(64)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "credoTenantId"`);
	}
}
