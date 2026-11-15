import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the indexes on existing tables: `identifier ("customerId", engine)` and the unique index on
 * `customer ("credoTenantId")`.
 *
 * Phase 1 of the Studio Credo migration, expand step (migration plan sections 4, 6.1 and 6.4).
 * Expand-only safety: indexes only, no data change. The unique index allows many NULLs (Postgres treats NULLs as
 * distinct), so customers without a Credo tenant are unaffected.
 *
 * CONCURRENTLY is NOT used, deliberately. The plan asks for it, but TypeORM refuses to run any migration that
 * sets `transaction = false` when the migration command uses its default `--transaction all` mode, which is what
 * `npm run migrate` and the docker entrypoint use. That would make the whole release fail to migrate. Instead,
 * each index is built with a 3s lock_timeout, so it fails rather than blocking traffic. `customer` and
 * `identifier` are small tables, so the build is quick.
 * To make this concurrent once the pipeline (gate item G5) runs `typeorm migration:run -t each`: add
 * `transaction = false`, replace `lock_timeout` handling with `SET lock_timeout`, and use CREATE INDEX CONCURRENTLY.
 */
export class StudioMigrations1791701100000 implements MigrationInterface {
	name = 'StudioMigrations1791701100000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`CREATE INDEX "IDX_identifier_customerId_engine" ON "identifier" ("customerId", "engine")`
		);
		await queryRunner.query(`CREATE UNIQUE INDEX "UQ_customer_credoTenantId" ON "customer" ("credoTenantId")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`DROP INDEX "UQ_customer_credoTenantId"`);
		await queryRunner.query(`DROP INDEX "IDX_identifier_customerId_engine"`);
	}
}
