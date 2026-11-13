import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Intentionally a no-op: Credo's Askar store does not live in Studio's database.
 *
 * This migration was first written to create a `credo` schema here. The design (knowledge-base, Credo tenancy and
 * storage, section 4) puts Credo's store in a database of its own on the same cluster (`CREDO_DB_NAME`, for
 * example `studio_credo`), with its own app role, because Askar's store id is the database name and it keeps its
 * tables in a schema named after the connecting role. A schema in Studio's database would never be used.
 *
 * The database and role are provisioned once, by hand, with the admin user: see
 * docs/credo-database-provisioning.md and scripts/credo-database-provisioning.sql. Migrations run as Studio's own
 * role and must not depend on that.
 *
 * The timestamp and class name are kept so that migration ordering, and any database that has already recorded
 * this migration, are unaffected. It had not been released, so nothing was created anywhere that needs removing.
 * Up and down both do nothing and are safe to run in any order.
 */
export class StudioMigrations1791700100000 implements MigrationInterface {
	name = 'StudioMigrations1791700100000';

	public async up(_queryRunner: QueryRunner): Promise<void> {
		// Nothing to create: see the note above.
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// Nothing was created, so nothing is dropped. A `credo` schema from an earlier draft of this migration, if
		// one exists on a development database, is left alone: it may hold data.
	}
}
