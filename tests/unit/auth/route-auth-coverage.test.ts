import { describe, expect, it, jest } from '@jest/globals';
import type { Request } from 'express';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));

const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const { APIGuard } = await import('../../../src/middleware/auth/auth-gaurd.js');
const { createAuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rules.js');

/**
 * Every route registered in src/app.ts must either have an auth rule for its method and path, or be listed here with
 * the reason it is reachable without one. A new route without a rule fails this test instead of answering 400 (or,
 * worse, falling to a broader rule) in production.
 */
const PUBLIC_ROUTES: Record<string, string> = {
	// Not behind the guard at all (APIGuard.skipPath)
	'GET /': 'redirect to the API docs',
	'GET /static/custom-button.js': 'static file',
	'POST /account/bootstrap': 'LogTo webhook, verified by its signature',
	'POST /admin/webhook': 'Stripe webhook, verified by its signature',
	// Behind the guard with an allowUnauthorized rule. Public by owner decision (F-12): lookups of public ledger data,
	// limited per IP address like every route.
	'GET /did/search/:did': 'public DID resolver',
	'GET /resource/search/:did': 'public resource resolver',
	'GET /credential-status/search': 'public status list lookup',
	// Public by owner decision (F-12): the Swagger UI calls it before sign-in; it says only isAuthenticated: false then
	'GET /auth/user-info': 'the caller’s own session, or only isAuthenticated: false without one',
};

const ROUTE_RE = /app\.(get|post|put|delete|patch)\(\s*([`'"])([^`'"]+)\2/g;
const appSource = readFileSync(join(process.cwd(), 'src/app.ts'), 'utf-8');
const routes = [...appSource.slice(appSource.indexOf('private routes()')).matchAll(ROUTE_RE)].map((m) => ({
	method: m[1].toUpperCase(),
	path: m[3],
	id: `${m[1].toUpperCase()} ${m[3]}`,
}));

const repository = createAuthRuleRepository();
const guard = new APIGuard(repository, {} as never);

/** A concrete path for an Express route: a testnet DID for `:did`, a plain token for any other parameter. */
const concrete = (path: string) =>
	path.replace(/:did\b/g, 'did:cheqd:testnet:5f1e7c1a-0000-4000-8000-000000000000').replace(/:\w+/g, 'abc123');
const requestFor = (method: string, path: string) =>
	({ method, path, body: { network: 'testnet' } }) as unknown as Request;

describe('route and auth-rule coverage', () => {
	it('finds the routes registered in src/app.ts', () => {
		expect(routes.length).toBeGreaterThan(100);
	});

	it.each(routes.filter((r) => !(r.id in PUBLIC_ROUTES)))('$id has an auth rule that requires a scope', (route) => {
		const path = concrete(route.path);
		expect(guard.skipPath(path)).toBe(false);
		const rule = repository.match(requestFor(route.method, path));
		expect(rule).not.toBeNull();
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});

	it.each(Object.keys(PUBLIC_ROUTES))('%s is registered, and public as listed', (id) => {
		const route = routes.find((r) => r.id === id);
		expect(route).toBeDefined();
		const path = concrete(route!.path);
		if (guard.skipPath(path)) return;
		expect(repository.match(requestFor(route!.method, path))?.isAllowedUnauthorized()).toBe(true);
	});

	it('marks no route public except those listed', () => {
		const publicByRule = routes
			.filter((r) => !guard.skipPath(concrete(r.path)))
			.filter((r) => repository.match(requestFor(r.method, concrete(r.path)))?.isAllowedUnauthorized())
			.map((r) => r.id);
		expect(publicByRule.every((id) => id in PUBLIC_ROUTES)).toBe(true);
	});

	it('applies the cancel scope to DELETE /admin/subscription/cancel, the method the route uses', () => {
		const rule = repository.match(requestFor('DELETE', '/admin/subscription/cancel'));
		expect(rule?.isValidScope('admin:subscription:cancel')).toBe(true);
		expect(repository.match(requestFor('POST', '/admin/subscription/cancel'))).toBeNull();
	});
});
