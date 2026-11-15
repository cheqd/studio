import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `agent.capabilities` (jsonb, NOT NULL, default all false) and `agent.useCase` (varchar(64), nullable).
 *
 * `capabilities` are labels the owner chose for the agent (A2A, AP2, KYA-OS, MCP). They are not enforcement.
 * `useCase` is free text for analytics only and is never trusted. Expand-only: the default fills existing rows, so
 * no row needs a backfill and the NOT NULL is safe. Reversible: `down` drops both columns.
 */
export class StudioMigrations1791701700000 implements MigrationInterface {
	name = 'StudioMigrations1791701700000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`ALTER TABLE "agent" ADD "capabilities" jsonb NOT NULL DEFAULT '{"a2a":false,"ap2":false,"kyaOs":false,"mcp":false}'::jsonb`
		);
		await queryRunner.query(`ALTER TABLE "agent" ADD "useCase" character varying(64)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(`ALTER TABLE "agent" DROP COLUMN "useCase"`);
		await queryRunner.query(`ALTER TABLE "agent" DROP COLUMN "capabilities"`);
	}
}
