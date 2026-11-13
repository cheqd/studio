import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

// Static wiring guards: the controllers cannot be imported in unit tests (they pull in the database layer),
// so these assert the source is wired to the tested helpers.
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

describe('export and deletion route wiring', () => {
	const app = read('src/app.ts');

	it('requires a fresh sign-in for /did/export', () => {
		expect(app).toMatch(/app\.post\('\/did\/export\/:did',\s*requireFreshSignIn\(\)/);
	});

	it('exportDid responds through respondWithEncryptedExport', () => {
		expect(read('src/controllers/api/did.ts')).toContain('respondWithEncryptedExport(');
	});

	it('the id-token fetchers record auth_time for the freshness check', () => {
		expect(read('src/middleware/auth/user-info-fetcher/idtoken.ts')).toContain('setAuthTime(');
		expect(read('src/middleware/auth/user-info-fetcher/portal-token.ts')).toContain('setAuthTime(');
	});
});
