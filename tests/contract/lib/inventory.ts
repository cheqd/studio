import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTERNAL_IDS, SENSITIVE_IDS, sideEffectFor, tierFor, type SideEffect, type Tier } from './route-metadata.js';

export type AuthKind =
	/** An auth rule marks the route `allowUnauthorized`. */
	| 'none'
	/** An auth rule requires a scope; API key (`x-api-key`), bearer token or portal id-token. */
	| 'scoped'
	/** The route is not covered by any auth rule: with the guard on, requests are rejected with 400. */
	| 'no-rule'
	/** Authenticated by a webhook signature rather than a Studio credential. */
	| 'webhook-signature'
	/** Not behind the guard (redirect or static file). */
	| 'unguarded';

export interface InventoryRoute {
	id: string;
	method: string;
	path: string;
	surface: 'api' | 'admin' | 'internal';
	auth: AuthKind;
	scopes: string[];
	tier: Tier;
	sideEffect: SideEffect;
	sensitive: boolean;
	/** Registered only when STRIPE_ENABLED=true. */
	stripeOnly: boolean;
	inRouteTable: boolean;
	inOpenApi: boolean;
}

export interface AuthRuleEntry {
	route: string;
	method: string;
	scope: string;
	allowUnauthorized: boolean;
}

const ROUTE_RE = /app\.(get|post|put|delete|patch|all)\(\s*([`'"])([^`'"]+)\2/g;

/** Parse the `routes()` method of src/app.ts. Returns each registration with whether it is Stripe-gated. */
export function parseRouteTable(appSource: string): { method: string; path: string; stripeOnly: boolean }[] {
	const start = appSource.indexOf('private routes()');
	if (start < 0) throw new Error('private routes() not found in src/app.ts');
	const body = appSource.slice(start);
	const stripeStart = body.search(/if \(process\.env\.STRIPE_ENABLED === 'true'\) \{\s*app\./);
	const out: { method: string; path: string; stripeOnly: boolean }[] = [];
	for (const m of body.matchAll(ROUTE_RE)) {
		const method = m[1].toUpperCase();
		if (method === 'ALL') continue; // catch-all 404 handler
		out.push({
			method,
			path: m[3],
			stripeOnly: stripeStart >= 0 && (m.index ?? 0) > stripeStart,
		});
	}
	return out;
}

/** Parse `this.registerRule('/route', 'METHOD', 'scope', { ... })` calls from the auth rule providers. */
export function parseAuthRules(source: string): AuthRuleEntry[] {
	const re = /registerRule\(\s*'([^']+)',\s*'([A-Z]+)',\s*'([^']*)'(?:,\s*(\{[^}]*\}))?\s*\)/g;
	const rules: AuthRuleEntry[] = [];
	for (const m of source.matchAll(re)) {
		rules.push({
			route: m[1],
			method: m[2],
			scope: m[3],
			allowUnauthorized: /allowUnauthorized:\s*true/.test(m[4] ?? ''),
		});
	}
	return rules;
}

function toOpenApiKey(method: string, expressPath: string): string {
	return `${method} ${expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`;
}

/** Mirrors AuthRule.match: unanchored regexp against the concrete path, same method. */
export function matchRules(rules: AuthRuleEntry[], method: string, expressPath: string): AuthRuleEntry[] {
	const concrete = expressPath.replace(/:([A-Za-z0-9_]+)/g, 'x');
	return rules.filter((r) => r.method === method && (r.route === concrete || new RegExp(r.route).test(concrete)));
}

export function parseOpenApi(json: { paths: Record<string, Record<string, unknown>> }): Set<string> {
	const keys = new Set<string>();
	for (const [path, ops] of Object.entries(json.paths)) {
		for (const method of Object.keys(ops)) {
			if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
				keys.add(`${method.toUpperCase()} ${path}`);
			}
		}
	}
	return keys;
}

export function buildInventory(repoRoot: string): InventoryRoute[] {
	const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8');
	const table = parseRouteTable(read('src/app.ts'));

	const ruleSources = [
		'account-auth',
		'accreditation-auth',
		'auth-user-info',
		'credential-auth',
		'credential-status-auth',
		'did-auth',
		'event-auth',
		'key-auth',
		'presentation-auth',
		'provider-auth',
		'resource-auth',
	].map((f) => read(`src/middleware/auth/routes/api/${f}.ts`));
	ruleSources.push(read('src/middleware/auth/routes/admin/admin-auth.ts'));
	const rules = ruleSources.flatMap(parseAuthRules);

	const openApi = new Set<string>([
		...parseOpenApi(JSON.parse(read('src/static/swagger-api.json'))),
		...parseOpenApi(JSON.parse(read('src/static/swagger-admin.json'))),
	]);

	const byId = new Map<string, InventoryRoute>();
	const add = (method: string, path: string, stripeOnly: boolean, inRouteTable: boolean) => {
		const id = `${method} ${path}`;
		const existing = byId.get(id);
		if (existing) {
			existing.inRouteTable ||= inRouteTable;
			return;
		}
		const internal = INTERNAL_IDS.includes(id);
		const matched = matchRules(rules, method, path);
		let auth: AuthKind;
		if (id === 'POST /account/bootstrap') auth = 'webhook-signature';
		else if (id === 'GET /' || id === 'GET /static/custom-button.js') auth = 'unguarded';
		else if (matched.length === 0) auth = 'no-rule';
		else if (matched.some((r) => r.allowUnauthorized)) auth = 'none';
		else auth = 'scoped';
		byId.set(id, {
			id,
			method,
			path,
			surface: internal ? 'internal' : path.startsWith('/admin/') ? 'admin' : 'api',
			auth,
			scopes: [...new Set(matched.map((r) => r.scope).filter(Boolean))].sort(),
			tier: tierFor(id),
			sideEffect: sideEffectFor(id),
			sensitive: SENSITIVE_IDS.includes(id),
			stripeOnly,
			inRouteTable,
			inOpenApi: openApi.has(toOpenApiKey(method, path)),
		});
	};
	for (const r of table) add(r.method, r.path, r.stripeOnly, true);

	// Routes documented in OpenAPI but absent from the route table are kept so the drift is visible.
	for (const key of openApi) {
		const [method, ...rest] = key.split(' ');
		const path = rest.join(' ').replace(/\{([A-Za-z0-9_]+)\}/g, ':$1');
		if (!byId.has(`${method} ${path}`)) add(method, path, false, false);
	}

	return [...byId.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export interface InventoryFile {
	generatedFrom: string;
	generatedBy: string;
	routes: InventoryRoute[];
}

export function serialiseInventory(routes: InventoryRoute[], gitRef: string): string {
	const file: InventoryFile = {
		generatedFrom: gitRef,
		generatedBy: 'npx tsx tests/contract/scripts/generate-inventory.ts',
		routes: routes.map((r) => ({ ...r })),
	};
	return JSON.stringify(file, null, '\t') + '\n';
}
