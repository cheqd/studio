import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { staffIdentity } from './staff-identity-fixture.js';

const auditRows: Array<Record<string, unknown>> = [];
jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					insert: async (row: Record<string, unknown>) => {
						auditRows.push(row);
					},
				}),
				transaction: async () => {
					throw new Error('a refused call must not reach the database');
				},
			},
		},
	},
}));
jest.unstable_mockModule('../../../src/services/api/account-deletion-live-deps.js', () => ({
	liveAccountDeletionDeps: {},
}));
const customerGet = jest.fn(async () => {
	throw new Error('a refused call must not look up a customer');
});
jest.unstable_mockModule('../../../src/services/api/customer.js', () => ({
	CustomerService: { instance: { get: customerGet } },
}));
jest.unstable_mockModule('../../../src/services/track/tracker.js', () => ({
	EventTracker: { compileBasicNotification: (message: string) => message },
	eventTracker: { notify: async () => undefined },
}));
const upsert = jest.fn();
jest.unstable_mockModule('../../../src/services/api/feature-flag.js', () => ({
	FeatureFlagService: {
		instance: {
			setFlag: upsert,
			readRows: async () => {
				throw new Error('a refused call must not read flags');
			},
		},
	},
	resolveFlags: () => ({}),
	credentialScreensMode: () => 'auto',
	validateFlagWrite: () => ({
		ok: true,
		write: { flagKey: 'engine', value: { engine: 'credo' }, reason: 'x' },
	}),
}));

const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');
const { CustomersAdminController } = await import('../../../src/controllers/admin/customers.js');
const { AnalyticsAdminController } = await import('../../../src/controllers/admin/analytics.js');
const { AuditLogAdminController } = await import('../../../src/controllers/admin/audit-log.js');
const { OrganisationController } = await import('../../../src/controllers/admin/organisation.js');
const { FlagsAdminController } = await import('../../../src/controllers/admin/flags.js');
const { ALL_STAFF_SCOPES } = await import('../../../src/controllers/admin/staff-guard.js');
const { isStaffScope, CUSTOMER_ADMIN_SCOPES } = await import('../../../src/controllers/admin/staff-policy.js');

const uuid = '11111111-1111-4111-8111-111111111111';

/** A service that fails the test if any staff handler reaches it. */
const forbiddenService = new Proxy(
	{},
	{
		get: (_target, name) => () => {
			throw new Error(`service call ${String(name)} must not happen on a refused request`);
		},
	}
) as never;

type Handler = (request: Request, response: Response) => Promise<unknown>;
const customers = new CustomersAdminController(() => forbiddenService);
const analytics = new AnalyticsAdminController(() => forbiddenService);
const audit = new AuditLogAdminController(() => forbiddenService);
const organisation = new OrganisationController();
const flags = new FlagsAdminController();

/** Every staff route, as a request path and the handler behind it. Each staff rule must be covered by one row. */
const handlers: Array<{ method: string; path: string; run: Handler }> = [
	{ method: 'GET', path: '/admin/customers', run: (q, r) => customers.list(q, r) },
	{ method: 'GET', path: `/admin/customers/${uuid}`, run: (q, r) => customers.get(q, r) },
	{ method: 'POST', path: `/admin/customers/${uuid}/email-reveal`, run: (q, r) => customers.revealEmail(q, r) },
	{ method: 'GET', path: '/admin/analytics/overview', run: (q, r) => analytics.overview(q, r) },
	{ method: 'GET', path: '/admin/analytics/endpoints', run: (q, r) => analytics.endpoints(q, r) },
	{ method: 'GET', path: '/admin/analytics/top-accounts', run: (q, r) => analytics.topAccounts(q, r) },
	{ method: 'GET', path: '/admin/analytics/plan-mix', run: (q, r) => analytics.planMix(q, r) },
	{ method: 'GET', path: '/admin/analytics/funnels', run: (q, r) => analytics.funnels(q, r) },
	{ method: 'GET', path: '/admin/analytics/faucet-to-ledger', run: (q, r) => analytics.faucetToLedger(q, r) },
	{ method: 'GET', path: '/admin/analytics/ledger-writes', run: (q, r) => analytics.ledgerWritesReport(q, r) },
	{ method: 'GET', path: '/admin/audit-log', run: (q, r) => audit.list(q, r) },
	{ method: 'DELETE', path: '/admin/organisation/delete', run: (q, r) => organisation.delete(q, r) },
	{ method: 'PUT', path: '/admin/flags', run: (q, r) => flags.putFlag(q, r) },
	{ method: 'GET', path: `/admin/customers/${uuid}/flags`, run: (q, r) => flags.getCustomerFlags(q, r) },
];

const rules = (
	(new AdminAuthRuleProvider() as unknown as { rules: unknown[] }).rules as Array<{
		route: string;
		method: string;
		scope: string;
		match(request: Request): boolean;
	}>
).slice();

const staffRules = rules.filter((rule) => isStaffScope(rule.scope));

function fakeResponse(locals: Record<string, unknown>) {
	return {
		locals,
		statusCode: 0,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	};
}

async function invoke(
	entry: { method: string; path: string; run: Handler },
	locals: Record<string, unknown>,
	headers = {}
) {
	const request = {
		method: entry.method,
		path: entry.path,
		headers,
		query: { journey: 'first-agent' },
		params: { id: uuid },
		body: { confirm: true, reason: 'test', customerId: uuid },
	} as unknown as Request;
	const response = fakeResponse(locals);
	await entry.run(request, response as unknown as Response);
	return response;
}

const original = process.env.ENABLE_AUTHENTICATION;
beforeEach(() => {
	process.env.ENABLE_AUTHENTICATION = 'true';
	auditRows.length = 0;
	customerGet.mockClear();
	upsert.mockClear();
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
	else process.env.ENABLE_AUTHENTICATION = original;
	jest.restoreAllMocks();
});

describe('route enumeration', () => {
	it('every scope guarding a staff rule is a known staff scope, and every known staff scope has a rule', () => {
		expect(new Set(staffRules.map((rule) => rule.scope))).toEqual(new Set(ALL_STAFF_SCOPES));
	});

	it('classifies every admin scope in the rules as either customer-facing or staff', () => {
		for (const rule of rules) {
			expect(rule.scope.startsWith('admin:')).toBe(true);
			expect(CUSTOMER_ADMIN_SCOPES.has(rule.scope) !== isStaffScope(rule.scope)).toBe(true);
		}
	});

	it('every staff rule is covered by a handler row in this test', () => {
		for (const rule of staffRules) {
			const covered = handlers.filter((entry) => entry.method === rule.method && rule.match(entry as never));
			expect([rule.route, rule.method, covered.length > 0]).toEqual([rule.route, rule.method, true]);
		}
	});

	it('every handler row is matched by a staff rule (no stale rows)', () => {
		for (const entry of handlers) {
			expect([entry.path, staffRules.some((rule) => rule.match(entry as never))]).toEqual([entry.path, true]);
		}
	});
});

describe('every staff route enforces the policy', () => {
	const scopes = [...ALL_STAFF_SCOPES];
	const variants: Array<[string, Record<string, unknown>, Record<string, string>]> = [
		['machine client with customer-id and every staff scope', { scopes }, { 'customer-id': uuid }],
		['API key with every staff scope', { scopes }, { 'x-api-key': 'k' }],
		['ID token only, no session marker', { scopes, staffIdentity: staffIdentity({ authMethod: undefined }) }, {}],
		['machine session marker', { scopes, staffIdentity: staffIdentity({ authMethod: 'm2m' }) }, {}],
		['no identity at all', { scopes }, {}],
		['unverified email', { scopes, staffIdentity: staffIdentity({ emailVerified: false }) }, {}],
		['email on another domain', { scopes, staffIdentity: staffIdentity({ email: 'staff@example.com' }) }, {}],
		[
			'subdomain of the allowed domain',
			{ scopes, staffIdentity: staffIdentity({ email: 'staff@mail.cheqd.io' }) },
			{},
		],
		['no staff role', { scopes, staffIdentity: staffIdentity({ roles: ['Portal'] }) }, {}],
		['roles unknown', { scopes, staffIdentity: staffIdentity({ roles: undefined }) }, {}],
		['no staff scope', { scopes: ['read:account'], staffIdentity: staffIdentity() }, {}],
	];

	for (const entry of handlers) {
		it.each(variants)(`${entry.method} ${entry.path} answers 403 for: %s`, async (_name, locals, headers) => {
			const response = await invoke(entry, locals, headers);
			expect(response.statusCode).toBe(403);
			expect(JSON.stringify(response.body)).not.toMatch(/email|domain|role|verified|session/i);
			expect(customerGet).not.toHaveBeenCalled();
			expect(upsert).not.toHaveBeenCalled();
		});
	}

	it('never writes the email to the log', async () => {
		const warn = console.warn as unknown as jest.Mock;
		await invoke(handlers[0], { scopes, staffIdentity: staffIdentity({ emailVerified: false }) });
		const logged = warn.mock.calls.flat().join(' ');
		expect(logged).toContain('logto-staff-1');
		expect(logged).toContain('email-unverified');
		expect(logged).not.toContain('staff@cheqd.io');
	});

	it('lets a verified cheqd person with the role and scope through to the handler', async () => {
		const response = await invoke(handlers.find((entry) => entry.method === 'PUT')!, {
			scopes,
			staffIdentity: staffIdentity(),
			user: { logToId: 'logto-staff-1' },
		});
		expect(response.statusCode).not.toBe(403);
		expect(upsert).toHaveBeenCalledTimes(1);
	});
});

describe('DELETE /admin/organisation/delete denial audit', () => {
	const entry = handlers.find((row) => row.method === 'DELETE')!;

	it('records a denied attempt with the actor, route and reason code, and no email', async () => {
		const response = await invoke(entry, {
			scopes: [...ALL_STAFF_SCOPES],
			staffIdentity: staffIdentity({ roles: ['Portal'] }),
		});
		expect(response.statusCode).toBe(403);
		expect(auditRows).toEqual([
			{
				actorUserId: 'logto-staff-1',
				action: 'staff.access.denied',
				targetCustomerId: uuid,
				reason: 'role-missing',
				metadata: { route: 'DELETE /admin/organisation/delete', reasonCode: 'role-missing' },
			},
		]);
		expect(JSON.stringify(auditRows)).not.toContain('@');
	});

	it('records a machine client as the actor m2m', async () => {
		await invoke(entry, { scopes: [...ALL_STAFF_SCOPES] }, { 'customer-id': uuid });
		expect(auditRows).toHaveLength(1);
		expect(auditRows[0]).toMatchObject({ actorUserId: 'm2m', reason: 'not-user-session' });
	});

	it('still answers 403 when the audit write fails', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const { Connection } = await import('../../../src/database/connection/connection.js');
		jest.spyOn(Connection.instance.dbConnection, 'getRepository').mockImplementation(() => {
			throw new Error('down');
		});
		const response = await invoke(entry, { scopes: [...ALL_STAFF_SCOPES] });
		expect(response.statusCode).toBe(403);
	});
});
