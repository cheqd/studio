import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Three more first-milestone dates on `customerActivation` (U-35): first API key the customer created, first faucet
 * request that credited the account, and first tracked API call. Expand-only and additive:
 * - three nullable `timestamptz` columns with no default, so adding them rewrites nothing and only holds the table
 *   lock for a moment (`customerActivation` has one row per customer, a few hundred rows);
 * - a backfill that only fills empty columns (`COALESCE` keeps any date already recorded), so it is safe to re-run.
 *   It reads each customer's earliest row through existing indexes: `operation(customerId, createdAt)` (one index
 *   probe per customer, however large `operation` is), `faucetRequest(customerId, createdAt)` and `apiKey`, which is
 *   small. Customers with none of the three get no new row. The same statement is in `docs/deployment-checklist.md`
 *   for a manual re-run.
 * API keys named `idToken` (portal session keys) or `Studio API Key for ...` (created by Studio itself) are not
 * counted: they are not the customer creating a key. Later events are written by `recordActivation`.
 * Reversible: `down` drops the three columns.
 */
export const BACKFILL_FIRST_MILESTONES_SQL = `INSERT INTO "customerActivation" ("customerId", "firstApiKeyCreatedAt", "firstFaucetRequestAt", "firstApiCallAt")
	SELECT * FROM (
		SELECT c."customerId",
			(SELECT MIN(ak."createdAt") FROM "apiKey" ak WHERE ak."customerId" = c."customerId" AND ak."name" <> 'idToken' AND ak."name" NOT LIKE 'Studio API Key for %') AS apikey,
			(SELECT MIN(fr."createdAt") FROM "faucetRequest" fr WHERE fr."customerId" = c."customerId" AND fr."status" = 'completed') AS faucet,
			(SELECT o."createdAt" FROM "operation" o WHERE o."customerId" = c."customerId" ORDER BY o."createdAt" LIMIT 1) AS apicall
		FROM "customer" c
	) t WHERE t.apikey IS NOT NULL OR t.faucet IS NOT NULL OR t.apicall IS NOT NULL
	ON CONFLICT ("customerId") DO UPDATE SET
		"firstApiKeyCreatedAt" = COALESCE("customerActivation"."firstApiKeyCreatedAt", EXCLUDED."firstApiKeyCreatedAt"),
		"firstFaucetRequestAt" = COALESCE("customerActivation"."firstFaucetRequestAt", EXCLUDED."firstFaucetRequestAt"),
		"firstApiCallAt" = COALESCE("customerActivation"."firstApiCallAt", EXCLUDED."firstApiCallAt"),
		"updatedAt" = now()`;

export class StudioMigrations1791702500100 implements MigrationInterface {
	name = 'StudioMigrations1791702500100';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`ALTER TABLE "customerActivation" ADD COLUMN IF NOT EXISTS "firstApiKeyCreatedAt" TIMESTAMP WITH TIME ZONE, ADD COLUMN IF NOT EXISTS "firstFaucetRequestAt" TIMESTAMP WITH TIME ZONE, ADD COLUMN IF NOT EXISTS "firstApiCallAt" TIMESTAMP WITH TIME ZONE`
		);
		await queryRunner.query(BACKFILL_FIRST_MILESTONES_SQL);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
		await queryRunner.query(
			`ALTER TABLE "customerActivation" DROP COLUMN IF EXISTS "firstApiCallAt", DROP COLUMN IF EXISTS "firstFaucetRequestAt", DROP COLUMN IF EXISTS "firstApiKeyCreatedAt"`
		);
	}
}
