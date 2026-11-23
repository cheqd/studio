import { describe, expect, it } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import {
	BACKFILL_FIRST_MILESTONES_SQL,
	StudioMigrations1791702500100,
} from '../../../src/database/migrations/1791702500100-studio-migrations.js';

function runner() {
	const statements: string[] = [];
	return {
		statements,
		queryRunner: { query: async (sql: string) => statements.push(sql) } as unknown as QueryRunner,
	};
}

describe('migration 1791702500100: first API key, faucet and API call dates (U-35)', () => {
	it('adds three nullable columns without a default, under a short lock timeout, then backfills', async () => {
		const { statements, queryRunner } = runner();
		await new StudioMigrations1791702500100().up(queryRunner);
		expect(statements[0]).toBe(`SET LOCAL lock_timeout = '3s'`);
		expect(statements[1]).toMatch(
			/^ALTER TABLE "customerActivation" ADD COLUMN IF NOT EXISTS "firstApiKeyCreatedAt"/
		);
		for (const column of ['firstApiKeyCreatedAt', 'firstFaucetRequestAt', 'firstApiCallAt']) {
			expect(statements[1]).toContain(`"${column}" TIMESTAMP WITH TIME ZONE`);
		}
		expect(statements[1]).not.toMatch(/DEFAULT|NOT NULL/);
		expect(statements[2]).toBe(BACKFILL_FIRST_MILESTONES_SQL);
	});

	it('the backfill only fills empty columns, so it keeps recorded dates and can be re-run', () => {
		for (const column of ['firstApiKeyCreatedAt', 'firstFaucetRequestAt', 'firstApiCallAt']) {
			expect(BACKFILL_FIRST_MILESTONES_SQL).toContain(
				`"${column}" = COALESCE("customerActivation"."${column}", EXCLUDED."${column}")`
			);
		}
		// existing milestone columns are never touched
		expect(BACKFILL_FIRST_MILESTONES_SQL).not.toMatch(/firstDidCreatedAt|firstCredentialIssuedAt/);
	});

	it('counts customer-created API keys and credited faucet requests only, and reads operation per customer', () => {
		expect(BACKFILL_FIRST_MILESTONES_SQL).toContain(`ak."name" <> 'idToken'`);
		expect(BACKFILL_FIRST_MILESTONES_SQL).toContain(`ak."name" NOT LIKE 'Studio API Key for %'`);
		expect(BACKFILL_FIRST_MILESTONES_SQL).toContain(`fr."status" = 'completed'`);
		expect(BACKFILL_FIRST_MILESTONES_SQL).toContain(
			`FROM "operation" o WHERE o."customerId" = c."customerId" ORDER BY o."createdAt" LIMIT 1`
		);
	});

	it('down drops only the three new columns', async () => {
		const { statements, queryRunner } = runner();
		await new StudioMigrations1791702500100().down(queryRunner);
		expect(statements[1]).toBe(
			`ALTER TABLE "customerActivation" DROP COLUMN IF EXISTS "firstApiCallAt", DROP COLUMN IF EXISTS "firstFaucetRequestAt", DROP COLUMN IF EXISTS "firstApiKeyCreatedAt"`
		);
	});
});
