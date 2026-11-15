/**
 * Keeps route-inventory.json honest. It fails when a route is added to or removed from the app without the inventory
 * being updated, when a tenant-scoped route has no isolation test, or when a route the guard should protect has no auth
 * rule. This is what makes "every tenant-scoped route" a checked claim rather than a hope.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import inventory from './route-inventory.json' with { type: 'json' };
import swaggerApi from '../../src/static/swagger-api.json' with { type: 'json' };
import swaggerAdmin from '../../src/static/swagger-admin.json' with { type: 'json' };
import { allAuthRules } from './harness/scopes.js';
import { bugLabel, itFor } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

type Entry = {
	method: string;
	path: string;
	openapi: boolean;
	classification: string;
	tenantScoped: boolean;
	sample: string;
	unauthenticated: string;
	coveredBy: string[];
};
const entries = inventory.routes as Entry[];
const key = (e: { method: string; path: string }) => `${e.method} ${e.path}`;

function routesInApp(): string[] {
	const source = read('../../src/app.ts');
	const found = [...source.matchAll(/app\.(get|post|put|delete|patch)\(\s*[`'"]([^`'"]+)[`'"]/g)];
	return found.map((m) => `${m[1].toUpperCase()} ${m[2]}`);
}

function routesInOpenApi(): string[] {
	const out: string[] = [];
	for (const doc of [swaggerApi, swaggerAdmin] as Array<{ paths: Record<string, Record<string, unknown>> }>) {
		for (const [path, methods] of Object.entries(doc.paths)) {
			for (const method of Object.keys(methods)) {
				out.push(`${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`);
			}
		}
	}
	return out;
}

describe('route inventory', () => {
	it('lists exactly the routes registered in src/app.ts', () => {
		const app = routesInApp().sort();
		const inv = entries.map(key).sort();
		expect({
			missingFromInventory: app.filter((r) => !inv.includes(r)),
			staleInInventory: inv.filter((r) => !app.includes(r)),
		}).toEqual({
			missingFromInventory: [],
			staleInInventory: [],
		});
	});

	it('records, for every route, whether the OpenAPI spec documents it', () => {
		const documented = new Set(routesInOpenApi());
		const wrong = entries.filter((e) => e.openapi !== documented.has(key(e))).map(key);
		expect(wrong).toEqual([]);
	});

	it('knows every route the OpenAPI specs document (the spec may not outrun the route table)', () => {
		const inv = new Set(entries.map(key));
		const unknown = routesInOpenApi().filter((r) => !inv.has(r));
		// The spec spells DELETE /admin/api-key/revoke and /admin/subscription/cancel as POST; those are known spec drift.
		expect(
			unknown.filter((r) => !['POST /admin/api-key/revoke', 'POST /admin/subscription/cancel'].includes(r))
		).toEqual([]);
	});

	it('has an isolation test for every tenant-scoped route, and the named file really mentions it', () => {
		const problems: string[] = [];
		for (const e of entries.filter((x) => x.tenantScoped)) {
			if (e.coveredBy.length === 0) problems.push(`${key(e)}: no covering test`);
			for (const file of e.coveredBy) {
				const text = read(file);
				if (!text.includes(`'${key(e)}'`) && !text.includes(`[${key(e)}]`))
					problems.push(`${key(e)}: ${file} does not mention it`);
			}
		}
		expect(problems).toEqual([]);
	});

	it('classifies every route and gives each non-public route a sample path for the no-credentials sweep', () => {
		const classes = new Set(['tenant', 'tenant-context', 'public', 'shared-catalogue', 'webhook', 'static']);
		expect(entries.filter((e) => !classes.has(e.classification)).map(key)).toEqual([]);
		expect(entries.filter((e) => e.unauthenticated === 'must-refuse' && !e.sample).map(key)).toEqual([]);
	});

	itFor(it, 'ISO-009')(`gives every guarded route an auth rule for its method${bugLabel('ISO-009')}`, async () => {
		const rules = await allAuthRules();
		const unguarded = entries
			.filter((e) => e.unauthenticated === 'must-refuse')
			.filter(
				(e) =>
					!rules.some((r) => r.method === e.method && new RegExp(r.route).test(decodeURIComponent(e.sample)))
			)
			.map(key);
		expect(unguarded).toEqual([]);
	});

	it('never lets an auth rule that allows unauthenticated access cover a route classed as tenant data', async () => {
		const rules = (await allAuthRules()).filter((r) => r.allowUnauthorized);
		const exposed = entries
			.filter((e) => e.tenantScoped)
			.filter((e) =>
				rules.some((r) => r.method === e.method && new RegExp(r.route).test(decodeURIComponent(e.sample)))
			)
			.map(key);
		expect(exposed).toEqual([]);
	});
});
