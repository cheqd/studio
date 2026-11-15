import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `npm run migrate` only runs the migrations listed in `src/database/types/types.ts`. A migration file that is not
 * registered there is silently skipped while its entity is registered, so the new code would query a missing table.
 * This test fails when a migration file is added without being registered.
 */
describe('database migrations', () => {
	const root = path.resolve(process.cwd(), 'src/database');
	const typesSource = readFileSync(path.join(root, 'types/types.ts'), 'utf8');
	const files = readdirSync(path.join(root, 'migrations')).filter((f) => /^\d+-studio-migrations\.ts$/.test(f));

	it('finds the studio migration files', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)('%s is imported and registered in types.ts', (file) => {
		const timestamp = file.split('-')[0];
		const name = `StudioMigrations${timestamp}`;
		expect(typesSource).toContain(`import { ${name} } from '../migrations/${file.replace('.ts', '.js')}'`);
		expect(typesSource).toMatch(new RegExp(String.raw`^\s+${name},\s*$`, 'm'));
	});
});
