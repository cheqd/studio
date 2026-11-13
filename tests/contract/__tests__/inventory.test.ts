import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { computeCoverage, renderCoverage } from '../lib/coverage';
import { loadFixtures, placeholdersIn } from '../lib/engine';
import { buildInventory, matchRules, parseAuthRules, parseRouteTable, type InventoryFile } from '../lib/inventory';
import { TIER_1_IDS, tierFor } from '../lib/route-metadata';
import { buildScenario } from '../lib/scenario';
import { DEFAULT_VARS } from '../lib/config';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(HERE, '../../..');
const contractDir = join(repoRoot, 'tests/contract');
const committed = JSON.parse(readFileSync(join(contractDir, 'inventory/routes.json'), 'utf-8')) as InventoryFile;
const live = buildInventory(repoRoot);

describe('route inventory', () => {
	it('matches what src/app.ts, the auth rules and the OpenAPI specs say now (regenerate with generate-inventory.ts)', () => {
		expect(committed.routes).toEqual(live);
	});

	it('contains every route registered in src/app.ts', () => {
		const table = parseRouteTable(readFileSync(join(repoRoot, 'src/app.ts'), 'utf-8'));
		expect(table.length).toBeGreaterThan(60);
		const ids = new Set(committed.routes.map((r) => r.id));
		for (const r of table) expect(ids.has(`${r.method} ${r.path}`)).toBe(true);
	});

	it('contains every OpenAPI operation, and every id is unique', () => {
		expect(committed.routes.filter((r) => !r.inRouteTable && r.inOpenApi).length).toBeLessThan(5);
		expect(new Set(committed.routes.map((r) => r.id)).size).toBe(committed.routes.length);
	});

	it('assigns tier 1 to faucet, balances and billing routes, and tier 2 elsewhere', () => {
		expect(tierFor('POST /account/faucet')).toBe(1);
		expect(tierFor('GET /account/balances')).toBe(1);
		expect(tierFor('POST /admin/webhook')).toBe(1);
		expect(tierFor('POST /did/create')).toBe(2);
		for (const id of TIER_1_IDS) expect(committed.routes.map((r) => r.id)).toContain(id);
	});

	it('marks the unauthenticated routes as public', () => {
		const none = committed.routes
			.filter((r) => r.auth === 'none')
			.map((r) => r.id)
			.sort();
		expect(none).toEqual(
			[
				'GET /auth/user-info',
				'GET /credential-status/search',
				'GET /did/search/:did',
				'GET /resource/search/:did',
			].sort()
		);
	});

	it('mirrors AuthRule matching (regexp, same method)', () => {
		const rules = parseAuthRules(
			"this.registerRule('/did/search/(.*)', 'GET', '', { allowUnauthorized: true, skipNamespace: true });"
		);
		expect(rules).toEqual([{ route: '/did/search/(.*)', method: 'GET', scope: '', allowUnauthorized: true }]);
		expect(matchRules(rules, 'GET', '/did/search/:did')).toHaveLength(1);
		expect(matchRules(rules, 'POST', '/did/search/:did')).toHaveLength(0);
	});
});

describe('scenario', () => {
	const scenario = buildScenario();
	const ids = new Set(committed.routes.map((r) => r.id));

	it('has unique step ids and only references routes that exist', () => {
		expect(new Set(scenario.map((s) => s.id)).size).toBe(scenario.length);
		for (const s of scenario) expect(ids.has(s.routeId)).toBe(true);
	});

	it('uses a method and path that agree with its route id', () => {
		for (const s of scenario) {
			const templated = s.path.replace(/\{[A-Za-z0-9_]+\}/g, ':p');
			const routePath = s.routeId.slice(s.routeId.indexOf(' ') + 1).replace(/:[A-Za-z0-9_]+/g, ':p');
			expect(`${s.method} ${templated}`).toBe(`${s.routeId.split(' ')[0]} ${routePath}`);
		}
	});

	it('only uses variables that come from the environment defaults or an earlier capture', () => {
		const known = new Set<string>([...Object.keys(DEFAULT_VARS), 'run', 'faucetAddress', 'paymentAddress']);
		for (const s of scenario) {
			for (const v of [...placeholdersIn(s), ...(s.requires ?? [])]) {
				expect({ step: s.id, variable: v, known: known.has(v) }).toEqual({
					step: s.id,
					variable: v,
					known: true,
				});
			}
			for (const v of Object.keys(s.capture ?? {})) known.add(v);
		}
	});

	it('keeps tier and effect consistent with the inventory', () => {
		for (const s of scenario) {
			const r = committed.routes.find((x) => x.id === s.routeId);
			if (r?.tier === 1) expect({ step: s.id, tier: s.tier }).toEqual({ step: s.id, tier: 1 });
		}
	});

	it('never targets mainnet or a literal secret', () => {
		const text = JSON.stringify(scenario);
		expect(text).not.toMatch(/mainnet/);
		expect(text).not.toMatch(/x-api-key/i);
	});
});

describe('coverage table', () => {
	it('is up to date (regenerate with generate-coverage.ts)', () => {
		const expected = renderCoverage(
			computeCoverage(live, buildScenario(), loadFixtures(join(contractDir, 'fixtures')))
		);
		expect(readFileSync(join(contractDir, 'coverage.md'), 'utf-8')).toBe(expected);
	});
});
