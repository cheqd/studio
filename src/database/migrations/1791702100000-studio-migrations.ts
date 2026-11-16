import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `identifier.kind` and `identifier.agentDeletedAt` (both nullable), and fill them from the agent table.
 *
 * Registering an agent creates its DID. Deleting the agent soft-deletes the agent row but leaves the DID active (the
 * ledger is not touched), so the DID kept being offered as a principal to act for. `kind = 'agent'` marks a DID made
 * for an agent; `agentDeletedAt` records when that agent was deleted. Backfill is provable from data: every `agent`
 * row, deleted or not, names its DID. Expand-only (two nullable columns, no default, no rewrite). Reversible: `down`
 * drops both columns.
 */
export class StudioMigrations1791702100000 implements MigrationInterface {
	name = 'StudioMigrations1791702100000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "identifier" ADD "kind" character varying(16)`);
		await queryRunner.query(`ALTER TABLE "identifier" ADD "agentDeletedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`UPDATE "identifier" SET "kind" = 'agent' WHERE "did" IN (SELECT "did" FROM "agent")`);
		await queryRunner.query(
			`UPDATE "identifier" i SET "agentDeletedAt" = a."deletedAt"
			 FROM (SELECT "did", MAX("deletedAt") AS "deletedAt" FROM "agent" GROUP BY "did" HAVING bool_and("deletedAt" IS NOT NULL)) a
			 WHERE i."did" = a."did"`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "agentDeletedAt"`);
		await queryRunner.query(`ALTER TABLE "identifier" DROP COLUMN "kind"`);
	}
}
