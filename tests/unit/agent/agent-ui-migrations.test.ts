import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { StudioMigrations1791701700000 } from '../../../src/database/migrations/1791701700000-studio-migrations.js';
import { StudioMigrations1791701800000 } from '../../../src/database/migrations/1791701800000-studio-migrations.js';
import { StudioMigrations1791701900000 } from '../../../src/database/migrations/1791701900000-studio-migrations.js';
import { AGENT_ACTORS, AGENT_EVENT_TYPES } from '../../../src/types/agent.js';

const run = async (migration: { up: (r: never) => Promise<void>; down: (r: never) => Promise<void> }) => {
	const up: string[] = [];
	const down: string[] = [];
	await migration.up({ query: async (sql: string) => void up.push(sql) } as never);
	await migration.down({ query: async (sql: string) => void down.push(sql) } as never);
	return { up: up.join('\n'), down: down.join('\n') };
};

describe('agent UI migrations', () => {
	it('are timestamped after 1791701600000, in order, and registered with the connection', () => {
		const names = [
			new StudioMigrations1791701700000().name,
			new StudioMigrations1791701800000().name,
			new StudioMigrations1791701900000().name,
		];
		expect(names).toEqual([
			'StudioMigrations1791701700000',
			'StudioMigrations1791701800000',
			'StudioMigrations1791701900000',
		]);
		const types = readFileSync('src/database/types/types.ts', 'utf8');
		for (const name of names) expect(types.match(new RegExp(name, 'g'))?.length).toBe(2); // import and list
	});

	it('adds capabilities (jsonb, not null, default all false) and useCase, and drops both on the way down', async () => {
		const { up, down } = await run(new StudioMigrations1791701700000() as never);
		expect(up).toMatch(
			/ADD "capabilities" jsonb NOT NULL DEFAULT '\{"a2a":false,"ap2":false,"kyaOs":false,"mcp":false\}'/
		);
		expect(up).toMatch(/ADD "useCase" character varying\(64\)/);
		expect(down).toMatch(/DROP COLUMN "capabilities"/);
		expect(down).toMatch(/DROP COLUMN "useCase"/);
	});

	it('creates agentEvent with checks matching the code, backfills from existing rows, and drops the table down', async () => {
		const { up, down } = await run(new StudioMigrations1791701800000() as never);
		for (const type of AGENT_EVENT_TYPES) expect(up).toContain(`'${type}'`);
		for (const actor of AGENT_ACTORS) expect(up).toContain(`'${actor}'`);
		expect(up).toMatch(/INSERT INTO "agentEvent"[\s\S]*FROM "agent"/);
		expect(up).toMatch(/'authority-granted'[\s\S]*FROM "authorityGrant"/);
		expect(up).toMatch(/'authority-revoked'[\s\S]*"revokedAt" IS NOT NULL/);
		expect(up).toMatch(/'card-published'[\s\S]*FROM "agentCard"/);
		// Backfilled rows say `system`, and nothing is read from the staff audit log
		expect(up).not.toMatch(/adminAuditLog/);
		expect(up.match(/'system'/g)?.length).toBeGreaterThanOrEqual(4);
		expect(down).toMatch(/DROP TABLE "agentEvent"/);
	});

	it('adds authorityGrant.claims as a nullable column and drops it down', async () => {
		const { up, down } = await run(new StudioMigrations1791701900000() as never);
		expect(up).toMatch(/ALTER TABLE "authorityGrant" ADD "claims" jsonb\s*$/m);
		expect(down).toMatch(/DROP COLUMN "claims"/);
	});
});
