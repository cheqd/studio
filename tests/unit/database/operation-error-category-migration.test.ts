import { describe, expect, it } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { StudioMigrations1791702500200 } from '../../../src/database/migrations/1791702500200-studio-migrations.js';

function runner() {
	const statements: string[] = [];
	return {
		statements,
		queryRunner: { query: async (sql: string) => statements.push(sql) } as unknown as QueryRunner,
	};
}

describe('migration 1791702500200: operation.errorCategory (U-30)', () => {
	it('adds one nullable column with no default (no rewrite of operation), under a short lock timeout', async () => {
		const { statements, queryRunner } = runner();
		await new StudioMigrations1791702500200().up(queryRunner);
		expect(statements).toEqual([
			`SET LOCAL lock_timeout = '3s'`,
			`ALTER TABLE "operation" ADD COLUMN IF NOT EXISTS "errorCategory" character varying(32)`,
		]);
	});

	it('down drops only that column', async () => {
		const { statements, queryRunner } = runner();
		await new StudioMigrations1791702500200().down(queryRunner);
		expect(statements[1]).toBe(`ALTER TABLE "operation" DROP COLUMN IF EXISTS "errorCategory"`);
	});
});
