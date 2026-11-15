import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AuthRuleRepository } from '../../../src/middleware/auth/routes/auth-rule-repository.js';
import { AccountAuthProvider } from '../../../src/middleware/auth/routes/api/account-auth.js';
import { AdminAuthRuleProvider } from '../../../src/middleware/auth/routes/admin/admin-auth.js';
import { CustomerAnalyticsController } from '../../../src/controllers/api/customer-analytics.js';
import { CustomerAnalyticsService } from '../../../src/services/analytics/customer-analytics.js';
import type { Queryable } from '../../../src/services/admin/admin-analytics.js';

const mine = '11111111-1111-4111-8111-111111111111';
const theirs = '22222222-2222-4222-8222-222222222222';

function serviceWith(rowsFor: (sql: string) => unknown[]) {
	const calls: Array<{ sql: string; parameters: unknown[] }> = [];
	const db: Queryable = {
		query: async (sql: string, parameters: unknown[] = []) => {
			calls.push({ sql, parameters });
			return rowsFor(sql);
		},
	};
	return { service: new CustomerAnalyticsService(() => db), calls };
}

describe('CustomerAnalyticsService', () => {
	it('window bounds are whole UTC days including today', () => {
		expect(CustomerAnalyticsService.bounds(7, new Date('2026-11-15T23:59:59Z'))).toEqual({
			from: '2026-11-09',
			to: '2026-11-15',
		});
		expect(CustomerAnalyticsService.bounds(30, new Date('2026-11-15T00:00:00Z'))).toEqual({
			from: '2026-10-17',
			to: '2026-11-15',
		});
	});

	it('agents: verification elements are explicit unsupported shapes, never zeros', async () => {
		const { service } = serviceWith((sql) => {
			if (sql.includes('"agentsRegistered"'))
				return [{ agentsRegistered: '2', authorityGranted: '3', authorityRevoked: '1' }];
			if (sql.includes('per_day')) return [{ date: '2026-11-15', count: '4' }];
			return [{ agentId: 'a1', name: 'Agent', events: '4', lastActivityAt: '2026-11-15T10:00:00Z' }];
		});
		const result = await service.agents(mine, 7);
		expect(result.audience).toBe('agents');
		for (const key of ['verificationsReceived', 'passedPercent', 'mandateChecks', 'agentCardFetches']) {
			expect(result.tiles[key]).toEqual({ supported: false, reason: expect.any(String) });
		}
		expect(result.series.verificationsPerDay).toEqual({ supported: false, reason: expect.any(String) });
		for (const key of ['byAgent', 'topVerifiers', 'byProtocol']) {
			expect(result.tables[key]).toEqual({ supported: false, reason: expect.any(String) });
		}
		expect(result.unavailable).toEqual([
			'tiles.verificationsReceived',
			'tiles.passedPercent',
			'tiles.mandateChecks',
			'tiles.agentCardFetches',
			'series.verificationsPerDay',
			'tables.byAgent',
			'tables.topVerifiers',
			'tables.byProtocol',
		]);
		expect(result.tiles.agentsRegistered).toEqual({ supported: true, value: 2 });
		expect(result.tiles.authorityGranted).toEqual({ supported: true, value: 3 });
		expect(result.series.agentActivityPerDay).toEqual({
			supported: true,
			points: [{ date: '2026-11-15', count: 4 }],
		});
		expect(result.tables.agentActivity).toEqual({
			supported: true,
			rows: [{ agentId: 'a1', name: 'Agent', events: 4, lastActivityAt: '2026-11-15T10:00:00.000Z' }],
		});
	});

	it('individuals: numeric tiles, per-day series, every known format listed (zero when unused), mdoc absent', async () => {
		const { service } = serviceWith((sql) => {
			if (sql.includes('"credentialsIssued"'))
				return [{ credentialsIssued: '5', presentationsVerified: '2', revoked: '1', statusChecks: '9' }];
			if (sql.includes('per_day')) return [{ date: '2026-11-14', count: '5' }];
			return [
				{ format: 'jwt', count: '3' },
				{ format: 'sd-jwt-vc', count: '2' },
				{ format: 'future-format', count: '1' },
			];
		});
		const result = await service.individuals(mine, 30);
		expect(result.tiles).toEqual({
			credentialsIssued: { supported: true, value: 5 },
			presentationsVerified: { supported: true, value: 2 },
			revoked: { supported: true, value: 1 },
			statusChecks: { supported: true, value: 9 },
		});
		const rows = (result.tables.byFormat as { rows: Array<{ format: string; count: number }> }).rows;
		expect(rows.map((r) => [r.format, r.count])).toEqual([
			['sd-jwt-vc', 2],
			['jwt', 3],
			['jsonld', 0],
			['anoncreds', 0],
			['future-format', 1],
		]);
		expect(rows.some((r) => r.format === 'mdoc')).toBe(false);
		expect(result.tables.partnerHandoffs).toEqual({ supported: false, reason: expect.any(String) });
		expect(result.unavailable).toEqual(['tables.partnerHandoffs']);
	});

	it('every statement is scoped to the customer id passed in, and none reads credential contents', async () => {
		const { service, calls } = serviceWith(() => []);
		await service.agents(mine, 30);
		await service.individuals(mine, 7);
		expect(calls.length).toBeGreaterThan(0);
		for (const { sql, parameters } of calls) {
			expect(parameters[1]).toBe(mine);
			expect(parameters).not.toContain(theirs);
			// each table read carries the customer filter
			expect(sql).toMatch(/"customerId" = \$2::uuid/);
			for (const forbidden of [
				'"card"',
				'"claims"',
				'"policySummary"',
				'"metadata"',
				'"credentialStatus"',
				'"subjectId"',
				'"veramoHash"',
				'"detail"',
				'"email"',
			]) {
				expect(sql).not.toContain(forbidden);
			}
		}
	});
});

function fakeService() {
	return {
		agents: jest.fn(async () => ({ audience: 'agents' })),
		individuals: jest.fn(async () => ({ audience: 'individuals' })),
	};
}

async function call(
	controller: CustomerAnalyticsController,
	handler: 'agents' | 'individuals',
	options: { query?: Record<string, string>; customerId?: string | null } = {}
) {
	const request = { method: 'GET', query: options.query ?? {}, params: {}, body: {} } as unknown as Request;
	for (const validator of CustomerAnalyticsController.analyticsValidator) await validator.run(request);
	const response = {
		locals: options.customerId === null ? {} : { customer: { customerId: options.customerId ?? mine } },
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
	await controller[handler](request, response as unknown as Response);
	return { status: response.statusCode, body: response.body };
}

describe('CustomerAnalyticsController', () => {
	it.each(['agents', 'individuals'] as const)(
		'%s: default 30 days, accepts 7 and 30, uses the signed-in customer',
		async (handler) => {
			const service = fakeService();
			const controller = new CustomerAnalyticsController(() => service as unknown as CustomerAnalyticsService);
			expect((await call(controller, handler)).status).toBe(200);
			expect(service[handler]).toHaveBeenLastCalledWith(mine, 30);
			expect((await call(controller, handler, { query: { range: '7' } })).status).toBe(200);
			expect(service[handler]).toHaveBeenLastCalledWith(mine, 7);
		}
	);

	it.each(['agents', 'individuals'] as const)(
		'%s: a customerId in the query cannot name another customer',
		async (handler) => {
			const service = fakeService();
			const controller = new CustomerAnalyticsController(() => service as unknown as CustomerAnalyticsService);
			await call(controller, handler, { query: { customerId: theirs, customer: theirs } });
			expect(service[handler]).toHaveBeenLastCalledWith(mine, 30);
		}
	);

	it.each([['14'], ['90'], ['0'], ['week']])('rejects range %s with 400 and does not query', async (range) => {
		const service = fakeService();
		const controller = new CustomerAnalyticsController(() => service as unknown as CustomerAnalyticsService);
		expect((await call(controller, 'agents', { query: { range } })).status).toBe(400);
		expect((await call(controller, 'individuals', { query: { range } })).status).toBe(400);
		expect(service.agents).not.toHaveBeenCalled();
		expect(service.individuals).not.toHaveBeenCalled();
	});

	it('answers 401 with no signed-in customer and 500 when the query fails', async () => {
		const service = fakeService();
		const controller = new CustomerAnalyticsController(() => service as unknown as CustomerAnalyticsService);
		expect((await call(controller, 'agents', { customerId: null })).status).toBe(401);
		expect(service.agents).not.toHaveBeenCalled();
		service.individuals.mockRejectedValueOnce(new Error('db down'));
		const failed = await call(controller, 'individuals');
		expect(failed.status).toBe(500);
		expect(failed.body).toEqual({ error: 'Internal error: db down' });
	});
});

describe('customer analytics auth rules', () => {
	const repository = new AuthRuleRepository();
	repository.push(new AccountAuthProvider());
	repository.push(new AdminAuthRuleProvider());
	const requestFor = (method: string, path: string) => ({ method, path }) as unknown as Request;

	it.each(['/account/analytics/agents', '/account/analytics/individuals', '/account/analytics/ledger'])(
		'GET %s needs read:account and is not anonymous',
		(path) => {
			const rule = repository.match(requestFor('GET', path));
			expect(rule?.isValidScope('read:account')).toBe(true);
			expect(rule?.isAllowedUnauthorized()).toBe(false);
			expect(rule?.areValidScopes(['list:agent', 'admin:analytics:read'])).toBe(false);
		}
	);

	it('keeps the existing account routes on read:account and does not open the staff route to customers', () => {
		for (const path of ['/account/analytics', '/account/balances', '/account']) {
			expect(repository.match(requestFor('GET', path))?.isValidScope('read:account')).toBe(true);
		}
		expect(
			repository.match(requestFor('GET', '/admin/analytics/faucet-to-ledger'))?.isValidScope('read:account')
		).toBe(false);
		expect(repository.match(requestFor('POST', '/account/analytics/agents'))?.isValidScope('create:account')).toBe(
			true
		);
	});
});
