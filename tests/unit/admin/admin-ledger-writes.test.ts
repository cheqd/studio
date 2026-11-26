import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import {
	AdminLedgerWritesService,
	RETENTION_DEFINITION,
	type LedgerWritesResponse,
} from '../../../src/services/admin/admin-ledger-writes.js';
import { AnalyticsAdminController } from '../../../src/controllers/admin/analytics.js';
import { STAFF_SCOPES } from '../../../src/controllers/admin/staff-guard.js';
import { staffIdentity } from './staff-identity-fixture.js';

// 2026-11-15 12:00 UTC
const NOW = Date.parse('2026-11-15T12:00:00Z');

interface Fixture {
	funded?: number;
	covered?: number;
	perDay?: Array<{ day: string; op: string; studio: boolean; n: string; fee: string }>;
	writers?: Array<{ studio: boolean; n: string }>;
	retention?: Array<{ week: number; cohort: string; eligible: string; retained: string }>;
}

function setup(fixture: Fixture = {}, enabled = true, minCoveragePercent = 90) {
	const statements: Array<{ sql: string; parameters: unknown[] }> = [];
	const service = new AdminLedgerWritesService(
		() => ({
			query: async (sql: string, parameters: unknown[] = []) => {
				statements.push({ sql, parameters });
				if (sql.includes('AS funded'))
					return [{ funded: String(fixture.funded ?? 10), covered: String(fixture.covered ?? 10) }];
				if (sql.includes('first AS')) return fixture.retention ?? [];
				if (sql.includes('COUNT(DISTINCT d."address")')) return fixture.writers ?? [];
				return fixture.perDay ?? [];
			},
		}),
		() => ({ enabled, minCoveragePercent }),
		() => NOW
	);
	return { service, statements };
}

function supported<T extends { supported: boolean }>(section: T): Extract<T, { supported: true }> {
	if (!section.supported) throw new Error('unsupported');
	return section as Extract<T, { supported: true }>;
}

describe('AdminLedgerWritesService', () => {
	it('is unsupported in every section, and reads nothing, when the indexer is off', async () => {
		const { service, statements } = setup({}, false);
		const result = await service.ledgerWrites(30);
		for (const key of ['writes', 'retention', 'fees', 'channels'] as const) {
			expect(result[key]).toMatchObject({ supported: false, reason: expect.stringContaining('not switched on') });
		}
		expect(statements).toHaveLength(0);
	});

	it('is unsupported when nobody is funded or coverage is below the threshold', async () => {
		const none = await setup({ funded: 0, covered: 0 }).service.ledgerWrites(7);
		expect(none.writes).toMatchObject({ supported: false, reason: expect.stringContaining('No address') });
		const low = await setup({ funded: 100, covered: 89 }).service.ledgerWrites(7);
		expect(low.coverage).toEqual({ fundedAddresses: 100, coveredAddresses: 89, percent: 89, minimumPercent: 90 });
		expect(low.fees).toMatchObject({ supported: false, reason: expect.stringContaining('89 of 100') });
		const ok = await setup({ funded: 100, covered: 90 }).service.ledgerWrites(7);
		expect(ok.writes.supported).toBe(true);
	});

	it('zero-fills writes by type and day for 7, 30 and 90 days', async () => {
		for (const range of [7, 30, 90] as const) {
			const result = await setup().service.ledgerWrites(range);
			const writes = supported(result.writes);
			expect(writes.days).toHaveLength(range);
			expect(writes.days.at(-1)?.date).toBe('2026-11-15');
			expect(writes.days[0]).toEqual({
				date: result.from,
				createDid: 0,
				updateDid: 0,
				deactivateDid: 0,
				createResource: 0,
				total: 0,
			});
			expect(writes.totals.total).toBe(0);
		}
		expect((await setup().service.ledgerWrites(7)).from).toBe('2026-11-09');
	});

	it('sums writes, exact fees and the Studio share', async () => {
		const { service } = setup({
			perDay: [
				{ day: '2026-11-15', op: 'createDid', studio: true, n: '2', fee: '4684629618236' },
				{ day: '2026-11-15', op: 'createDid', studio: false, n: '1', fee: '2342314809118' },
				{ day: '2026-11-14', op: 'createResource', studio: true, n: '3', fee: '1391697942327' },
				{ day: '2026-11-14', op: 'updateDid', studio: false, n: '1', fee: '1' },
				{ day: '2026-10-01', op: 'createDid', studio: true, n: '9', fee: '9' }, // outside the range: ignored
				{ day: '2026-11-14', op: 'mystery', studio: true, n: '9', fee: '9' }, // unknown operation: ignored
			],
			writers: [
				{ studio: true, n: '2' },
				{ studio: false, n: '1' },
			],
		});
		const result = await service.ledgerWrites(7);
		const writes = supported(result.writes);
		expect(writes.days.find((d) => d.date === '2026-11-15')).toMatchObject({ createDid: 3, total: 3 });
		expect(writes.totals).toEqual({ createDid: 3, updateDid: 1, deactivateDid: 0, createResource: 3, total: 7 });
		const fees = supported(result.fees);
		expect(fees.basis).toMatch(/exact/);
		expect(fees.denom).toBe('CHEQ');
		expect(fees.byOperation.find((o) => o.operationType === 'createDid')).toEqual({
			operationType: 'createDid',
			studioPayerAccounts: { writes: 2, ncheq: '4684629618236', cheq: 4684.629618236 },
			otherAddresses: { writes: 1, ncheq: '2342314809118', cheq: 2342.314809118 },
			total: { writes: 3, ncheq: '7026944427354', cheq: 7026.944427354 },
		});
		expect(fees.totals.studioPayerAccounts).toEqual({ writes: 5, ncheq: '6076327560563', cheq: 6076.327560563 });
		expect(fees.totals.total.ncheq).toBe((6076327560563n + 2342314809119n).toString());
		const channels = supported(result.channels);
		expect(channels).toMatchObject({ studioWrites: 5, otherWrites: 2, writingAddresses: { studio: 2, other: 1 } });
		expect(channels.studioShare).toBeCloseTo(5 / 7, 3);
	});

	it('has a null Studio share, not zero, when nothing was written', async () => {
		const channels = supported((await setup().service.ledgerWrites(30)).channels);
		expect(channels.studioShare).toBeNull();
		expect(channels.writingAddresses).toEqual({ studio: 0, other: 0 });
	});

	it('reports retention at 1, 2 and 4 weeks with null where nobody is eligible, and states the definition', async () => {
		const { service } = setup({
			retention: [
				{ week: 1, cohort: '10', eligible: '8', retained: '4' },
				{ week: 2, cohort: '10', eligible: '4', retained: '1' },
				{ week: 4, cohort: '10', eligible: '0', retained: '0' },
			],
		});
		const retention = supported((await service.ledgerWrites(90)).retention);
		expect(retention.cohort).toBe(10);
		expect(retention.weeks).toEqual([
			{ week: 1, eligible: 8, retained: 4, share: 0.5 },
			{ week: 2, eligible: 4, retained: 1, share: 0.25 },
			{ week: 4, eligible: 0, retained: 0, share: null },
		]);
		expect(retention.definition).toBe(RETENTION_DEFINITION);
		expect(retention.definition).toMatch(/UTC/);
	});

	it('with an empty cohort still lists the three weeks', async () => {
		const retention = supported((await setup().service.ledgerWrites(30)).retention);
		expect(retention.weeks.map((w) => [w.week, w.share])).toEqual([
			[1, null],
			[2, null],
			[4, null],
		]);
	});

	it('every statement is bounded to covered addresses and the range, and reads no identifier', async () => {
		const { service, statements } = setup();
		await service.ledgerWrites(30);
		expect(statements.length).toBeGreaterThan(0);
		for (const { sql, parameters } of statements) {
			expect(parameters[0]).toBe('2026-10-17');
			expect(sql).toMatch(/dailySyncedAt/);
			expect(sql).not.toMatch(/"didId"|"did"|transactionHash|"email"/);
		}
	});

	it('rejects a range that is not 7, 30 or 90', async () => {
		await expect(setup().service.ledgerWrites(14 as never)).rejects.toThrow();
	});
});

describe('AnalyticsAdminController.ledgerWritesReport', () => {
	const fakeResult = { range: 30 } as LedgerWritesResponse;

	async function call(query: Record<string, unknown>) {
		const ledgerWrites = jest.fn(async (_range: number) => fakeResult);
		const controller = new AnalyticsAdminController(
			undefined,
			() => ({ ledgerWrites }) as unknown as AdminLedgerWritesService
		);
		const request = { method: 'GET', query, params: {}, body: {} } as unknown as Request;
		for (const validator of AnalyticsAdminController.ledgerWritesValidator) await validator.run(request);
		const response = {
			locals: { scopes: [STAFF_SCOPES.analyticsRead], staffIdentity: staffIdentity() },
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
		await controller.ledgerWritesReport(request, response as unknown as Response);
		return { status: response.statusCode, ledgerWrites };
	}

	it('defaults to 30 and accepts 7, 30 and 90', async () => {
		expect((await call({})).ledgerWrites).toHaveBeenCalledWith(30);
		for (const range of ['7', '30', '90']) {
			const { status, ledgerWrites } = await call({ range });
			expect(status).toBe(200);
			expect(ledgerWrites).toHaveBeenCalledWith(Number(range));
		}
	});

	it.each([[{ range: '14' }], [{ range: 'x' }], [{ range: ['7', '30'] }], [{ range: ['7'] }]])(
		'answers 400, not 500, for %j',
		async (query) => {
			const { status, ledgerWrites } = await call(query);
			expect(status).toBe(400);
			expect(ledgerWrites).not.toHaveBeenCalled();
		}
	);
});
