import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { getMetadataArgsStorage } from 'typeorm';
import { StudioMigrations1791702700000 } from '../../../src/database/migrations/1791702700000-studio-migrations.js';
import { AuthorityCredentialEntity } from '../../../src/database/entities/authority-credential.entity.js';

const run = async (migration: { up: (r: never) => Promise<void>; down: (r: never) => Promise<void> }) => {
	const up: string[] = [];
	const down: string[] = [];
	await migration.up({ query: async (sql: string) => void up.push(sql) } as never);
	await migration.down({ query: async (sql: string) => void down.push(sql) } as never);
	return { up: up.join('\n'), down: down.join('\n') };
};

describe('authorityCredential migration', () => {
	it('is timestamped after 1791702600000, is the newest, and is registered with the connection', () => {
		const migration = new StudioMigrations1791702700000();
		expect(migration.name).toBe('StudioMigrations1791702700000');
		const stamps = readdirSync('src/database/migrations')
			.map((file) => Number(file.split('-')[0]))
			.filter(Number.isFinite);
		expect(Math.max(...stamps)).toBe(1791702700000);
		const types = readFileSync('src/database/types/types.ts', 'utf8');
		expect(types.match(/StudioMigrations1791702700000/g)?.length).toBe(2); // import and list
		expect(types).toMatch(/\bAuthorityCredentialEntity,/);
	});

	it('creates one new table, sealed (jsonb, not null) with no plaintext column, and drops it down', async () => {
		const { up, down } = await run(new StudioMigrations1791702700000() as never);
		expect(up).toMatch(/CREATE TABLE "authorityCredential"/);
		expect(up).toMatch(/"sealed" jsonb NOT NULL/);
		expect(up).not.toMatch(/"(value|credential|plaintext)"/);
		// Additive only: nothing existing is altered
		expect(up).not.toMatch(/ALTER TABLE "(?!authorityCredential")/);
		expect(up).toMatch(/CHECK \(\("grantId" IS NULL\) <> \("bindingId" IS NULL\)\)/);
		expect(up).toMatch(
			/CREATE UNIQUE INDEX "UQ_authorityCredential_grantId_current"[^\n]*WHERE "supersededAt" IS NULL/
		);
		expect(down).toMatch(/DROP TABLE "authorityCredential"/);
	});

	it('deletes stored credentials with the customer (account deletion), the agent, the grant and the binding', async () => {
		const { up } = await run(new StudioMigrations1791702700000() as never);
		for (const [column, table] of [
			['customerId', 'customer'],
			['agentId', 'agent'],
			['grantId', 'authorityGrant'],
			['bindingId', 'paymentAddressBinding'],
		]) {
			expect(up).toMatch(
				new RegExp(`FOREIGN KEY \\("${column}"\\) REFERENCES "${table}"\\([^)]*\\) ON DELETE CASCADE`)
			);
		}
		const relations = getMetadataArgsStorage().relations.filter((r) => r.target === AuthorityCredentialEntity);
		for (const name of ['customer', 'agent', 'grant', 'binding']) {
			expect(relations.find((r) => r.propertyName === name)?.options.onDelete).toBe('CASCADE');
		}
	});
});
