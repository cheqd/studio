import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `authorityGrant.claims` (jsonb, nullable).
 *
 * Changing a grant's expiry issues a replacement credential, so Studio must be able to rebuild the grant's
 * grant-specific claims: the tool names of a tool-scope grant, or the constraints of an open mandate. They are
 * policy, not secrets (the signed credential is still returned once and never stored, and `cnf` keys are never
 * kept: a replacement is bound to the agent's current key). Grants made before this migration have no `claims`;
 * `acts-for` grants need none, and the others answer 409 on an expiry change. Expand-only: one nullable column, no
 * default, no rewrite. Reversible: `down` drops the column.
 */
export class StudioMigrations1791701900000 implements MigrationInterface {
	name = 'StudioMigrations1791701900000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "authorityGrant" ADD "claims" jsonb`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "authorityGrant" DROP COLUMN "claims"`);
	}
}
