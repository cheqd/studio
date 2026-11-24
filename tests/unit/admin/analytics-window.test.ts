import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { staffIdentity } from './staff-identity-fixture.js';
import { AnalyticsAdminController } from '../../../src/controllers/admin/analytics.js';
import { AdminAnalyticsService, analyticsWindow, type Queryable } from '../../../src/services/admin/admin-analytics.js';

const now = new Date('2026-11-24T15:30:00Z');

describe('analyticsWindow (U-36)', () => {
	it('presets end today (UTC), included, as before', () => {
		expect(analyticsWindow(7, now)).toEqual({
			range: 7,
			from: '2026-11-18',
			to: '2026-11-24',
			parameter: ['2026-11-18T00:00:00.000Z', '2026-11-25T00:00:00.000Z'],
		});
		expect(analyticsWindow(90, now).from).toBe('2026-08-27');
	});

	it('all has no start (the SQL uses the first sign-up) and ends today', () => {
		expect(analyticsWindow('all', now)).toEqual({
			range: 'all',
			from: null,
			to: '2026-11-24',
			parameter: [null, '2026-11-25T00:00:00.000Z'],
		});
	});

	it('custom dates include both ends', () => {
		expect(analyticsWindow({ from: '2026-10-01', to: '2026-10-31' }, now)).toEqual({
			range: 'custom',
			from: '2026-10-01',
			to: '2026-10-31',
			parameter: ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'],
		});
	});
});

describe('windowed SQL', () => {
	function serviceWith(rowsFor: (sql: string) => unknown[]) {
		const calls: Array<{ sql: string; parameters: unknown[] }> = [];
		const db: Queryable = {
			query: async (sql: string, parameters: unknown[] = []) => {
				calls.push({ sql, parameters });
				return rowsFor(sql);
			},
		};
		return { service: new AdminAnalyticsService(() => db), calls };
	}

	it('every windowed statement bounds both ends and binds the window as $1', async () => {
		const { service, calls } = serviceWith(() => []);
		const custom = { from: '2026-10-01', to: '2026-10-31' };
		await service.overview(custom, 'all');
		await service.endpoints('all', 'all');
		await service.topAccounts(custom, 'agents', 10);
		await service.funnel('first-agent', custom, 'all');
		await service.faucetToLedger('all', 'all');
		for (const { sql, parameters } of calls) {
			expect(sql).toContain('($1::text[])[2]::timestamptz AS stop');
			expect(sql).not.toContain('$1::int');
			const bounded = sql.match(/>= win\.start AND [\w."]+ < win\.stop/g) ?? [];
			expect(bounded.length).toBe((sql.match(/>= win\.start/g) ?? []).length);
			expect(Array.isArray(parameters[0])).toBe(true);
		}
		expect(calls[0].parameters[0]).toEqual(['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);
		// range=all starts at the first sign-up
		expect(calls.find((c) => (c.parameters[0] as unknown[])[0] === null)?.sql).toContain(
			`SELECT date_trunc('day', MIN(c0."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM "customer" c0`
		);
	});

	it('faucet-to-ledger reports the window it used', async () => {
		const { service } = serviceWith(() => [{ funded: '0' }]);
		const custom = await service.faucetToLedger({ from: '2026-10-01', to: '2026-10-31' }, 'all');
		expect([custom.range, custom.from, custom.to]).toEqual(['custom', '2026-10-01', '2026-10-31']);
		const all = await service.faucetToLedger('all', 'all');
		expect([all.range, all.from]).toEqual(['all', null]);
	});

	it('funnel with cohort=week groups by calendar week (Monday, UTC) and shapes each week', async () => {
		const { service, calls } = serviceWith((sql) =>
			sql.includes('"weekStart"')
				? [
						{ weekStart: '2026-11-09', accounts0: '3', accounts1: '2', gap1: '10' },
						{ weekStart: '2026-11-16', accounts0: '5', accounts1: '1', gap1: null },
					]
				: [{ accounts0: '8', accounts1: '3', gap1: '10' }]
		);
		const result = await service.funnel('first-credential', 30, 'all', 'week');
		expect(calls[1].sql).toContain(
			`to_char(date_trunc('week', j.signed AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "weekStart"`
		);
		expect(calls[1].sql).toContain('GROUP BY 1 ORDER BY 1');
		expect(result.steps[0].accounts).toBe(8);
		expect(result.cohort).toBe('week');
		expect(result.cohorts?.map((c) => [c.weekStart, c.steps[0].accounts, c.steps[1].accounts])).toEqual([
			['2026-11-09', 3, 2],
			['2026-11-16', 5, 1],
		]);
		expect(result.cohorts?.[0].steps.map((s) => s.key)).toEqual(result.steps.map((s) => s.key));
	});

	it('funnel without a cohort runs one statement and has no cohorts field', async () => {
		const { service, calls } = serviceWith(() => [{}]);
		const result = await service.funnel('first-credential', 30, 'all');
		expect(calls).toHaveLength(1);
		expect('cohorts' in result).toBe(false);
		expect([result.range, typeof result.from, typeof result.to]).toEqual([30, 'string', 'string']);
	});
});

describe('window and cohort query parameters', () => {
	const service = {
		overview: jest.fn(async () => ({})),
		endpoints: jest.fn(async () => []),
		topAccounts: jest.fn(async () => []),
		funnel: jest.fn(async () => ({})),
		faucetToLedger: jest.fn(async () => ({})),
	};
	const controller = new AnalyticsAdminController(() => service as unknown as AdminAnalyticsService);
	const original = process.env.ENABLE_AUTHENTICATION;

	beforeEach(() => {
		for (const fn of Object.values(service)) fn.mockClear();
		Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
	});
	afterEach(() => {
		if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
		else process.env.ENABLE_AUTHENTICATION = original;
	});

	async function call(
		handler: 'overview' | 'endpoints' | 'topAccounts' | 'funnels' | 'faucetToLedger',
		validators: Array<{ run: (req: Request) => Promise<unknown> }>,
		query: Record<string, string>
	) {
		const request = { method: 'GET', query, params: {}, body: {} } as unknown as Request;
		for (const validator of validators) await validator.run(request);
		const response = {
			locals: { scopes: [], staffIdentity: staffIdentity() },
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
		return response;
	}

	it('range=all and from/to reach the service; a preset still arrives as a number', async () => {
		expect((await call('overview', AnalyticsAdminController.overviewValidator, { range: 'all' })).statusCode).toBe(
			200
		);
		expect(service.overview).toHaveBeenLastCalledWith('all', 'all');
		await call('endpoints', AnalyticsAdminController.endpointsValidator, { from: '2026-01-01', to: '2026-02-04' });
		expect(service.endpoints).toHaveBeenLastCalledWith({ from: '2026-01-01', to: '2026-02-04' }, 'all');
		await call('topAccounts', AnalyticsAdminController.topAccountsValidator, { range: '7' });
		expect(service.topAccounts).toHaveBeenLastCalledWith(7, 'all', 10);
		await call('faucetToLedger', AnalyticsAdminController.faucetToLedgerValidator, { range: 'all' });
		expect(service.faucetToLedger).toHaveBeenLastCalledWith('all', 'all');
	});

	it('the longest custom span (400 days, both ends included) is accepted', async () => {
		const result = await call('overview', AnalyticsAdminController.overviewValidator, {
			from: '2025-10-21',
			to: '2026-11-24',
		});
		expect(result.statusCode).toBe(200);
	});

	it('funnels accept cohort=week and pass it on; without it the call is unchanged', async () => {
		await call('funnels', AnalyticsAdminController.funnelsValidator, { journey: 'first-agent', cohort: 'week' });
		expect(service.funnel).toHaveBeenLastCalledWith('first-agent', 30, 'all', 'week');
		await call('funnels', AnalyticsAdminController.funnelsValidator, { journey: 'first-agent', range: 'all' });
		expect(service.funnel).toHaveBeenLastCalledWith('first-agent', 'all', 'all');
	});

	it.each([
		['from without to', { from: '2026-01-01' }],
		['to without from', { to: '2026-01-01' }],
		['range with from and to', { range: '30', from: '2026-01-01', to: '2026-01-31' }],
		['a non-date', { from: 'yesterday', to: '2026-01-31' }],
		['an impossible date', { from: '2026-02-30', to: '2026-03-01' }],
		['a datetime', { from: '2026-01-01T00:00:00Z', to: '2026-01-31' }],
		['from after to', { from: '2026-02-01', to: '2026-01-31' }],
		['more than 400 days', { from: '2025-10-20', to: '2026-11-24' }],
		['range=365', { range: '365' }],
		['range=ALL', { range: 'ALL' }],
	])('rejects %s with 400 and does not query', async (_name, query) => {
		for (const [handler, validators] of [
			['overview', AnalyticsAdminController.overviewValidator],
			['funnels', AnalyticsAdminController.funnelsValidator],
			['faucetToLedger', AnalyticsAdminController.faucetToLedgerValidator],
		] as const) {
			const result = await call(handler, validators, { journey: 'first-agent', ...query });
			expect([handler, result.statusCode]).toEqual([handler, 400]);
		}
		for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
	});

	it('rejects an unknown cohort', async () => {
		const result = await call('funnels', AnalyticsAdminController.funnelsValidator, {
			journey: 'first-agent',
			cohort: 'month',
		});
		expect(result.statusCode).toBe(400);
		expect(service.funnel).not.toHaveBeenCalled();
	});
});
