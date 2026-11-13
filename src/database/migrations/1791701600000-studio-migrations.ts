import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `authorityGrant.policySummary` (jsonb, nullable).
 *
 * The settlement view (Proposed) shows an agent's open AP2 payment mandate as an x402 payment policy. The signed
 * mandate is returned once and never stored, so Studio keeps only a NON-secret summary of it at grant time: cap per
 * payment, budget, recurrence, payee names and execution window. Expand-only: one nullable column, no default, no
 * rewrite of existing rows (grants made before this migration have no summary and are not shown). Reversible:
 * `down` drops the column.
 */
export class StudioMigrations1791701600000 implements MigrationInterface {
	name = 'StudioMigrations1791701600000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "authorityGrant" ADD "policySummary" jsonb`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "authorityGrant" DROP COLUMN "policySummary"`);
	}
}
