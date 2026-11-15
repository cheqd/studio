import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';
import { AdminAuthRuleProvider } from '../../../src/middleware/auth/routes/admin/admin-auth.js';
import { AccountAuthProvider } from '../../../src/middleware/auth/routes/api/account-auth.js';
import { KeyAuthProvider } from '../../../src/middleware/auth/routes/api/key-auth.js';
import { DidAuthRuleProvider } from '../../../src/middleware/auth/routes/api/did-auth.js';
import { ResourceAuthRuleProvider } from '../../../src/middleware/auth/routes/api/resource-auth.js';
import { CredentialAuthRuleProvider } from '../../../src/middleware/auth/routes/api/credential-auth.js';
import { CredentialStatusAuthRuleProvider } from '../../../src/middleware/auth/routes/api/credential-status-auth.js';
import { PresentationAuthRuleProvider } from '../../../src/middleware/auth/routes/api/presentation-auth.js';
import { AccreditationAuthRuleProvider } from '../../../src/middleware/auth/routes/api/accreditation-auth.js';
import { EventAuthRuleProvider } from '../../../src/middleware/auth/routes/api/event-auth.js';
import { AgentAuthRuleProvider } from '../../../src/middleware/auth/routes/api/agent-auth.js';
import { FlagsAuthRuleProvider } from '../../../src/middleware/auth/routes/api/flags-auth.js';
import { CustomersAdminController } from '../../../src/controllers/admin/customers.js';
import { AnalyticsAdminController } from '../../../src/controllers/admin/analytics.js';
import { AuditLogAdminController } from '../../../src/controllers/admin/audit-log.js';
import {
	AdminAnalyticsService,
	routeForOperation,
	type Queryable,
} from '../../../src/services/admin/admin-analytics.js';

const requestFor = (method: string, path: string) => ({ method, path }) as unknown as Request;

// The order the real repository uses (src/middleware/authentication.ts), so a look-alike can't win an earlier rule
const repository = new AuthRuleRepository();
for (const provider of [
	new AccountAuthProvider(),
	new KeyAuthProvider(),
	new DidAuthRuleProvider(),
	new ResourceAuthRuleProvider(),
	new CredentialAuthRuleProvider(),
	new CredentialStatusAuthRuleProvider(),
	new PresentationAuthRuleProvider(),
	new AccreditationAuthRuleProvider(),
	new EventAuthRuleProvider(),
	new AgentAuthRuleProvider(),
	new FlagsAuthRuleProvider(),
	new AdminAuthRuleProvider(),
]) {
	repository.push(provider);
}

const uuid = '11111111-1111-4111-8111-111111111111';

describe('staff auth rules', () => {
	it.each([
		['/admin/customers', 'admin:customers:read'],
		[`/admin/customers/${uuid}`, 'admin:customers:read'],
		['/admin/analytics/overview', 'admin:analytics:read'],
		['/admin/analytics/endpoints', 'admin:analytics:read'],
		['/admin/analytics/top-accounts', 'admin:analytics:read'],
		['/admin/analytics/plan-mix', 'admin:analytics:read'],
		['/admin/analytics/funnels', 'admin:analytics:read'],
		['/admin/analytics/faucet-to-ledger', 'admin:analytics:read'],
		['/admin/audit-log', 'admin:audit:read'],
	])('GET %s needs exactly %s and is not open to anonymous callers', (path, scope) => {
		const rule = repository.match(requestFor('GET', path));
		expect(rule).not.toBeNull();
		expect(rule?.isValidScope(scope)).toBe(true);
		expect(rule?.isAllowedUnauthorized()).toBe(false);
		// customer scopes, other staff scopes and the delete scope do not open it
		expect(
			rule?.areValidScopes([
				'read:account',
				'list:agent',
				'admin:organisation:get',
				'admin:organisation:delete',
				...['admin:customers:read', 'admin:analytics:read', 'admin:audit:read'].filter((s) => s !== scope),
			])
		).toBe(false);
	});

	it('DELETE /admin/organisation/delete keeps its scope', () => {
		const rule = repository.match(requestFor('DELETE', '/admin/organisation/delete'));
		expect(rule?.isValidScope('admin:organisation:delete')).toBe(true);
	});

	it('anchored: look-alike paths and other methods match no staff rule', () => {
		const provider = new AdminAuthRuleProvider();
		for (const [method, path] of [
			['POST', '/admin/customers'],
			['DELETE', `/admin/customers/${uuid}`],
			['PUT', '/admin/customers'],
			['GET', '/admin/customers/'],
			['GET', `/admin/customers/${uuid}/keys`],
			['GET', '/v1/admin/customers'],
			['GET', '/did/admin/customers'],
			['GET', '/admin/customersx'],
			['GET', '/admin/analytics'],
			['GET', '/admin/analytics/'],
			['GET', '/admin/analytics/overview/extra'],
			['GET', '/admin/analytics/overviews'],
			['GET', '/x/admin/analytics/overview'],
			['POST', '/admin/analytics/overview'],
			['GET', '/admin/audit-log/'],
			['GET', '/admin/audit-logs'],
			['POST', '/admin/audit-log'],
			['DELETE', '/admin/audit-log'],
		] as const) {
			expect([method, path, provider.match(requestFor(method, path))]).toEqual([method, path, null]);
		}
	});

	it('the staff paths are matched by no earlier customer-facing rule', () => {
		for (const path of ['/admin/customers', '/admin/analytics/overview', '/admin/audit-log']) {
			const rule = repository.match(requestFor('GET', path));
			expect(rule?.isValidScope('read:account')).toBe(false);
		}
	});
});

interface FakeResponse {
	locals: Record<string, unknown>;
	statusCode: number;
	body: unknown;
	status(code: number): FakeResponse;
	json(body: unknown): FakeResponse;
}

async function call(
	controller: object,
	handler: string,
	validators: Array<{ run: (req: Request) => Promise<unknown> }>,
	options: { query?: Record<string, string>; params?: Record<string, string>; scopes?: string[] } = {}
) {
	const request = {
		method: 'GET',
		query: options.query ?? {},
		params: options.params ?? {},
		body: {},
	} as unknown as Request;
	for (const validator of validators) await validator.run(request);
	const response: FakeResponse = {
		locals: { scopes: options.scopes ?? [] },
		statusCode: 0,
		body: undefined,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
	await (controller as Record<string, (req: Request, res: Response) => Promise<unknown>>)[handler](
		request,
		response as unknown as Response
	);
	return { status: response.statusCode, body: response.body as Record<string, unknown> & unknown[] };
}

function fakeService() {
	const service = {
		listCustomers: jest.fn(async () => ({ customers: [], total: 0 })),
		getCustomer: jest.fn(async (id: string): Promise<unknown> => (id === uuid ? { id } : null)),
		overview: jest.fn(async () => ({ tiles: {}, series: {} })),
		endpoints: jest.fn(async () => []),
		topAccounts: jest.fn(async () => []),
		planMix: jest.fn(async () => ({ plans: [], paidPercent: 0 })),
		funnel: jest.fn(async () => ({ journey: 'first-agent', steps: [] })),
		auditLog: jest.fn(async () => ({ entries: [], total: 0 })),
	};
	return service;
}

describe('staff endpoints: validation, defaults and staff-only enforcement', () => {
	let service: ReturnType<typeof fakeService>;
	let customers: CustomersAdminController;
	let analytics: AnalyticsAdminController;
	let audit: AuditLogAdminController;
	const original = process.env.ENABLE_AUTHENTICATION;

	beforeEach(() => {
		service = fakeService();
		const provide = () => service as unknown as AdminAnalyticsService;
		customers = new CustomersAdminController(provide);
		analytics = new AnalyticsAdminController(provide);
		audit = new AuditLogAdminController(provide);
		Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
	});
	afterEach(() => {
		if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
		else process.env.ENABLE_AUTHENTICATION = original;
	});

	it('GET /admin/customers defaults to page 1 and 25 and passes the filters through', async () => {
		const result = await call(customers, 'list', CustomersAdminController.listValidator, {
			query: { q: 'acme', plan: 'Build', status: 'active', page: '2', limit: '100' },
		});
		expect(result.status).toBe(200);
		expect(service.listCustomers).toHaveBeenCalledWith({
			q: 'acme',
			plan: 'Build',
			status: 'active',
			page: 2,
			limit: 100,
		});
		await call(customers, 'list', CustomersAdminController.listValidator);
		expect(service.listCustomers).toHaveBeenLastCalledWith({
			q: undefined,
			plan: undefined,
			status: undefined,
			page: 1,
			limit: 25,
		});
	});

	it.each([
		['limit above 100', { limit: '101' }],
		['limit of 0', { limit: '0' }],
		['a non-numeric limit', { limit: 'ten' }],
		['page 0', { page: '0' }],
		['an unknown status', { status: 'deleted' }],
	])('GET /admin/customers rejects %s with 400 and does not query', async (_name, query) => {
		const result = await call(customers, 'list', CustomersAdminController.listValidator, { query });
		expect(result.status).toBe(400);
		expect(service.listCustomers).not.toHaveBeenCalled();
	});

	it('GET /admin/customers/{id}: 404 for an unknown id, 400 for a non-UUID, 200 otherwise', async () => {
		const unknown = await call(customers, 'get', CustomersAdminController.getValidator, {
			params: { id: '22222222-2222-4222-8222-222222222222' },
		});
		expect(unknown.status).toBe(404);
		expect(
			(await call(customers, 'get', CustomersAdminController.getValidator, { params: { id: 'org_a1f3' } })).status
		).toBe(400);
		const found = await call(customers, 'get', CustomersAdminController.getValidator, { params: { id: uuid } });
		expect(found.status).toBe(200);
		expect(found.body).toEqual({ id: uuid });
	});

	it('analytics routes default to 30 days and all segments, and accept 7, 30 and 90', async () => {
		await call(analytics, 'overview', AnalyticsAdminController.overviewValidator);
		expect(service.overview).toHaveBeenCalledWith(30, 'all');
		for (const range of ['7', '30', '90']) {
			const r = await call(analytics, 'endpoints', AnalyticsAdminController.endpointsValidator, {
				query: { range, segment: 'agents' },
			});
			expect(r.status).toBe(200);
			expect(service.endpoints).toHaveBeenLastCalledWith(Number(range), 'agents');
		}
		for (const segment of ['agents', 'people', 'unclassified', 'all']) {
			expect(
				(await call(analytics, 'overview', AnalyticsAdminController.overviewValidator, { query: { segment } }))
					.status
			).toBe(200);
		}
	});

	it.each([
		['overview', 'overviewValidator', { range: '14' }],
		['overview', 'overviewValidator', { segment: 'everyone' }],
		['endpoints', 'endpointsValidator', { range: '1000' }],
		['topAccounts', 'topAccountsValidator', { limit: '500' }],
		['topAccounts', 'topAccountsValidator', { range: 'week' }],
		['funnels', 'funnelsValidator', {}],
		['funnels', 'funnelsValidator', { journey: 'first-payment' }],
		['funnels', 'funnelsValidator', { journey: 'first-agent', range: '365' }],
	] as Array<
		[
			string,
			'overviewValidator' | 'endpointsValidator' | 'topAccountsValidator' | 'funnelsValidator',
			Record<string, string>,
		]
	>)('%s rejects bad input %j with 400 and does not query', async (handler, validators, query) => {
		const result = await call(analytics, handler, AnalyticsAdminController[validators], { query });
		expect(result.status).toBe(400);
		for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
	});

	it('top-accounts defaults to 10, funnels pass the journey', async () => {
		await call(analytics, 'topAccounts', AnalyticsAdminController.topAccountsValidator);
		expect(service.topAccounts).toHaveBeenCalledWith(30, 'all', 10);
		await call(analytics, 'funnels', AnalyticsAdminController.funnelsValidator, {
			query: { journey: 'first-agent', range: '90', segment: 'people' },
		});
		expect(service.funnel).toHaveBeenCalledWith('first-agent', 90, 'people');
	});

	it('GET /admin/audit-log paginates with defaults 25 and a maximum of 100', async () => {
		await call(audit, 'list', AuditLogAdminController.listValidator);
		expect(service.auditLog).toHaveBeenCalledWith(1, 25);
		await call(audit, 'list', AuditLogAdminController.listValidator, { query: { page: '3', limit: '100' } });
		expect(service.auditLog).toHaveBeenLastCalledWith(3, 100);
		expect(
			(await call(audit, 'list', AuditLogAdminController.listValidator, { query: { limit: '101' } })).status
		).toBe(400);
	});

	it('with authentication on, every handler answers 403 without its staff scope and never queries', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		const customerScopes = ['read:account', 'admin:analytics:read', 'admin:audit:read'];
		const checks: Array<
			[object, string, Array<{ run: (req: Request) => Promise<unknown> }>, Record<string, string>, string[]]
		> = [
			[customers, 'list', CustomersAdminController.listValidator, {}, customerScopes],
			[customers, 'get', CustomersAdminController.getValidator, { id: uuid }, customerScopes],
			[
				analytics,
				'overview',
				AnalyticsAdminController.overviewValidator,
				{},
				['admin:customers:read', 'admin:audit:read'],
			],
			[analytics, 'endpoints', AnalyticsAdminController.endpointsValidator, {}, ['admin:customers:read']],
			[analytics, 'topAccounts', AnalyticsAdminController.topAccountsValidator, {}, ['admin:customers:read']],
			[analytics, 'planMix', [], {}, ['admin:customers:read']],
			[
				analytics,
				'funnels',
				AnalyticsAdminController.funnelsValidator,
				{ journey: 'first-agent' },
				['admin:customers:read'],
			],
			[
				audit,
				'list',
				AuditLogAdminController.listValidator,
				{},
				['admin:customers:read', 'admin:analytics:read'],
			],
		];
		for (const [controller, handler, validators, query, scopes] of checks) {
			const result = await call(controller, handler, validators, {
				query,
				params: query,
				scopes,
			});
			expect([handler, result.status]).toEqual([handler, 403]);
		}
		for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
		// and the right scope gets through
		expect((await call(analytics, 'planMix', [], {})).status).toBe(403);
		expect((await call(analytics, 'planMix', [], { scopes: ['admin:analytics:read'] })).status).toBe(200);
	});
});

describe('AdminAnalyticsService shaping and privacy', () => {
	function serviceWith(rowsFor: (sql: string) => unknown[]) {
		const statements: string[] = [];
		const db: Queryable = {
			query: async (sql: string) => {
				statements.push(sql);
				return rowsFor(sql);
			},
		};
		return { service: new AdminAnalyticsService(() => db), statements };
	}

	it('maps operation names to routes and keeps unknown names visible', () => {
		expect(routeForOperation('did-create')).toEqual({ method: 'POST', route: '/did/create' });
		expect(routeForOperation('did-search')).toEqual({ method: 'GET', route: '/did/search/:did' });
		expect(routeForOperation('something-new')).toEqual({ method: '', route: 'something-new' });
	});

	it('shapes endpoint rows: error rate as a fraction, average rounded, 0 without durations', async () => {
		const { service } = serviceWith(() => [
			{ name: 'did-create', calls: '8', failed: '2', avgMs: '120.4' },
			{ name: 'key-read', calls: '3', failed: '0', avgMs: null },
		]);
		expect(await service.endpoints(30, 'all')).toEqual([
			{ method: 'POST', route: '/did/create', calls: 8, errorRate: 0.25, avgMs: 120 },
			{ method: 'GET', route: '/key/read/:kid', calls: 3, errorRate: 0, avgMs: 0 },
		]);
	});

	it('shapes the plan mix and the paid percentage (build counts as paid by default)', async () => {
		const { service } = serviceWith(() => [
			{ plan: 'Basic', accounts: '6' },
			{ plan: 'Build', accounts: '2' },
			{ plan: 'none', accounts: '2' },
		]);
		expect(await service.planMix()).toEqual({
			plans: [
				{ plan: 'Basic', accounts: 6 },
				{ plan: 'Build', accounts: 2 },
				{ plan: 'none', accounts: 2 },
			],
			paidPercent: 20,
		});
	});

	it('shapes the customer list: status from last activity, usage as numbers, no secrets', async () => {
		const recent = new Date().toISOString();
		const { service } = serviceWith((sql) =>
			sql.includes('COUNT(*) AS total')
				? [{ total: '2' }]
				: [
						{
							id: 'a',
							name: 'A',
							email: 'a@x',
							createdAt: recent,
							plan: 'Build',
							lastActiveAt: recent,
							apiCalls30d: '5',
							identifiers: '2',
							credentials: '1',
							keys: '3',
							apiKeys: '2',
							network: 'mainnet',
						},
						{
							id: 'b',
							name: 'B',
							email: 'b@x',
							createdAt: recent,
							plan: 'none',
							lastActiveAt: null,
							apiCalls30d: '0',
							identifiers: '0',
							credentials: '0',
							keys: '1',
							apiKeys: '0',
							network: 'testnet',
						},
					]
		);
		const result = await service.listCustomers({ page: 1, limit: 25 });
		expect(result.total).toBe(2);
		expect(result.customers.map((c) => [c.id, c.status, c.network, c.lastActiveAt === null])).toEqual([
			['a', 'active', 'mainnet', false],
			['b', 'inactive', 'testnet', true],
		]);
		expect(result.customers[0].usage).toEqual({
			apiCalls30d: 5,
			identifiers: 2,
			credentials: 1,
			keys: 3,
			didKeys: 3,
			apiKeys: 2,
		});
	});

	it('counts API keys from the apiKey table, leaving revoked ones out, and keeps DID keys separate', async () => {
		const seen: string[] = [];
		const { service } = serviceWith((sql) => {
			seen.push(sql);
			return sql.includes('COUNT(*) AS total') ? [{ total: '0' }] : [];
		});
		await service.listCustomers({ page: 1, limit: 25 });
		const text = seen.join('\n');
		expect(text).toMatch(
			/FROM "apiKey" ak WHERE ak\."customerId" = \w+\.id AND ak\."revoked" = false\) AS "apiKeys"/
		);
		expect(text).toMatch(/FROM "key" k WHERE k\."customerId" = \w+\.id\) AS keys/);
	});

	it('escapes LIKE wildcards in q and passes it as a parameter, never in the SQL text', async () => {
		const seen: Array<{ sql: string; parameters: unknown[] }> = [];
		const db: Queryable = {
			query: async (sql: string, parameters: unknown[] = []) => {
				seen.push({ sql, parameters });
				return [{ total: '0' }];
			},
		};
		await new AdminAnalyticsService(() => db).listCustomers({
			q: "50%_'; DROP TABLE customer; --",
			page: 1,
			limit: 25,
		});
		for (const { sql, parameters } of seen) {
			expect(sql).not.toContain('DROP TABLE');
			expect(parameters[0]).toBe("%50\\%\\_'; DROP TABLE customer; --%");
		}
	});

	it('selects counts only: no statement touches key material, credential contents, claims or API keys', async () => {
		const { service, statements } = serviceWith(() => []);
		await service.listCustomers({ page: 1, limit: 25 });
		await service.getCustomer(uuid);
		await service.overview(30, 'all');
		await service.endpoints(30, 'all');
		await service.topAccounts(30, 'all', 10);
		await service.planMix();
		await service.funnel('first-credential', 30, 'all');
		await service.funnel('first-agent', 30, 'all');
		await service.auditLog(1, 25);
		expect(statements.length).toBeGreaterThan(10);
		const forbidden = [
			/private-?key/i,
			/"privateKeyHex"/,
			/"publicKeyHex"/,
			// the apiKey table may be counted (`FROM "apiKey"`), never read as a column
			/(?<!FROM )"apiKey"/,
			/"apiKeyHash"/,
			/"claim"/,
			/"claims"/,
			/"credentialStatus"/,
			/"metadata"/,
			/"jws"\s*,/,
			/"card"/,
			/"mnemonic"/,
			/"description"/,
		];
		for (const sql of statements) {
			for (const pattern of forbidden)
				expect([pattern.source, sql.match(pattern)?.[0]]).toEqual([pattern.source, undefined]);
		}
		// every statement is a read
		for (const sql of statements) expect(sql.trimStart()).toMatch(/^(WITH|SELECT)/);
	});

	it('funnel shapes steps in order with null for the first and for empty gaps, and counts are non-increasing', async () => {
		const { service } = serviceWith(() => [
			{
				accounts0: '10',
				gap0: null,
				accounts1: '6',
				gap1: '120.4',
				accounts2: '3',
				gap2: '3600',
				accounts3: '0',
				gap3: null,
			},
		]);
		const funnel = await service.funnel('first-credential', 30, 'agents');
		expect(funnel.journey).toBe('first-credential');
		expect(funnel.steps).toEqual([
			{ key: 'signed-up', label: 'Signed up', accounts: 10, medianSecondsFromPrevious: null },
			{ key: 'funded', label: 'Funded address', accounts: 6, medianSecondsFromPrevious: 120 },
			{ key: 'first-did', label: 'First DID created', accounts: 3, medianSecondsFromPrevious: 3600 },
			{ key: 'first-credential', label: 'First credential issued', accounts: 0, medianSecondsFromPrevious: null },
		]);
		const agent = await serviceWith(() => [{}]).service.funnel('first-agent', 7, 'all');
		expect(agent.steps.map((s) => s.key)).toEqual([
			'signed-up',
			'funded',
			'first-did',
			'registered-agent',
			'card-signed',
		]);
	});

	it('audit entries expose the customer id as target and never a customer name or email', async () => {
		const { service } = serviceWith((sql) =>
			sql.includes('COUNT(*)')
				? [{ total: '1' }]
				: [
						{
							id: 'e1',
							when: new Date('2026-11-13T10:00:00Z'),
							staff: 'staff@cheqd.example',
							action: 'customer.delete',
							target: uuid,
							reason: 'User request',
							ticketRef: 'SUP-1',
						},
					]
		);
		expect(await service.auditLog(1, 25)).toEqual({
			entries: [
				{
					id: 'e1',
					when: '2026-11-13T10:00:00.000Z',
					staff: 'staff@cheqd.example',
					action: 'customer.delete',
					target: uuid,
					reason: 'User request',
					ticketRef: 'SUP-1',
				},
			],
			total: 1,
		});
	});
});
