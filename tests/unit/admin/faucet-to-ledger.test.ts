import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { staffIdentity } from './staff-identity-fixture.js';
import type { Request, Response } from 'express';
import { AnalyticsAdminController } from '../../../src/controllers/admin/analytics.js';
import { AdminAnalyticsService, type Queryable } from '../../../src/services/admin/admin-analytics.js';

function serviceWith(rowsFor: () => unknown[]) {
	const calls: Array<{ sql: string; parameters: unknown[] }> = [];
	const db: Queryable = {
		query: async (sql: string, parameters: unknown[] = []) => {
			calls.push({ sql, parameters });
			return rowsFor();
		},
	};
	return { service: new AdminAnalyticsService(() => db), calls };
}

const row = {
	funded: '10',
	own: '6',
	firstWrite7d: '4',
	wroteAgain: '2',
	toppedUp: '3',
	did: '3',
	lists: '1',
	other: '2',
	withinHour: '1',
	withinDay: '2',
	withinWeek: '1',
	withinMonth: '0',
};

describe('AdminAnalyticsService.faucetToLedger', () => {
	it('shapes Studio-recorded figures and marks everything that needs the ledger as unsupported', async () => {
		const { service } = serviceWith(() => [row]);
		const result = await service.faucetToLedger(30, 'all');
		expect(result.network).toBe('testnet');
		expect(result.tiles.fundedAddresses).toEqual({ supported: true, value: 10 });
		expect(result.tiles.fundedToOwnAccount).toEqual({ supported: true, value: 6 });
		expect(result.tiles.wroteViaStudioWithin7Days).toEqual({ supported: true, value: 4 });
		for (const key of ['savedToProfile', 'wroteToLedgerWithin7Days', 'stillOffLedger']) {
			expect(result.tiles[key]).toEqual({ supported: false, reason: expect.any(String) });
		}
		expect(result.ledgerFunnel).toEqual({ supported: false, reason: expect.any(String) });
		expect(result.ledgerVsStudioJourneys).toEqual({ supported: false, reason: expect.any(String) });
		expect(result.unavailable).toEqual([
			'tiles.savedToProfile',
			'tiles.wroteToLedgerWithin7Days',
			'tiles.stillOffLedger',
			'ledgerFunnel',
			'ledgerVsStudioJourneys',
		]);
		expect(result.funnel).toEqual({
			supported: true,
			rows: [
				{ key: 'funded', label: expect.any(String), addresses: 10, basis: 'all-funded' },
				{ key: 'first-studio-write-7d', label: expect.any(String), addresses: 4, basis: 'own-account' },
				{ key: 'wrote-again', label: expect.any(String), addresses: 2, basis: 'own-account' },
				{ key: 'topped-up', label: expect.any(String), addresses: 3, basis: 'all-funded' },
			],
		});
		expect(
			(result.writeKinds as { rows: unknown[] }).rows.map((r) => (r as { addresses: number }).addresses)
		).toEqual([3, 1, 2]);
		expect((result.timeToFirstWrite as { rows: Array<{ key: string }> }).rows.map((r) => r.key)).toEqual([
			'within-hour',
			'within-day',
			'within-week',
			'within-month',
		]);
		expect(result.notes.length).toBeGreaterThan(0);
	});

	it('returns real zeros (supported) when nobody was funded, not an unsupported shape', async () => {
		const { service } = serviceWith(() => [{ funded: '0', own: '0' }]);
		const result = await service.faucetToLedger(7, 'agents');
		expect(result.tiles.fundedAddresses).toEqual({ supported: true, value: 0 });
		expect((result.funnel as { rows: Array<{ addresses: number }> }).rows.every((r) => r.addresses === 0)).toBe(
			true
		);
	});

	it('passes range, segment and the write operation names as parameters, and selects only counts', async () => {
		const { service, calls } = serviceWith(() => [row]);
		await service.faucetToLedger(90, 'people');
		const [{ sql, parameters }] = calls;
		expect(parameters[0]).toBe(90);
		expect(parameters[1]).toBe('people');
		expect(parameters[2]).toEqual(expect.arrayContaining(['did-create', 'resource-create', 'credential-revoke']));
		expect(parameters[2]).not.toContain('credential-verify');
		expect(parameters[2]).not.toContain('did-import');
		// completed requests only, testnet writes only, own-account addresses only
		expect(sql).toContain(`fr."status" = 'completed'`);
		expect(sql).toContain(`o."network" = 'testnet'`);
		expect(sql).toContain(`"paymentAccount"`);
		for (const forbidden of ['"email"', '"name"', '"card"', '"claims"', '"metadata"'])
			expect(sql).not.toContain(forbidden);
	});
});

describe('GET /admin/analytics/faucet-to-ledger controller', () => {
	const original = process.env.ENABLE_AUTHENTICATION;
	let faucetToLedger: jest.Mock<(range: number, segment: string) => Promise<unknown>>;
	let controller: AnalyticsAdminController;
	beforeEach(() => {
		Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
		faucetToLedger = jest.fn(async () => ({ ok: true }));
		controller = new AnalyticsAdminController(() => ({ faucetToLedger }) as unknown as AdminAnalyticsService);
	});
	afterEach(() => {
		if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
		else process.env.ENABLE_AUTHENTICATION = original;
	});

	async function call(query: Record<string, string>, scopes: string[] = []) {
		const request = { method: 'GET', query, params: {}, body: {} } as unknown as Request;
		for (const validator of AnalyticsAdminController.faucetToLedgerValidator) await validator.run(request);
		const response = {
			locals: { scopes, staffIdentity: staffIdentity() },
			statusCode: 0,
			status(code: number) {
				this.statusCode = code;
				return this;
			},
			json() {
				return this;
			},
		};
		await controller.faucetToLedger(request, response as unknown as Response);
		return response.statusCode;
	}

	it('defaults to 30 days and all segments, accepts 7, 30 and 90 and every segment', async () => {
		expect(await call({})).toBe(200);
		expect(faucetToLedger).toHaveBeenLastCalledWith(30, 'all');
		for (const range of ['7', '30', '90']) {
			expect(await call({ range, segment: 'unclassified' })).toBe(200);
			expect(faucetToLedger).toHaveBeenLastCalledWith(Number(range), 'unclassified');
		}
	});

	it.each([[{ range: '14' }], [{ range: '365' }], [{ segment: 'everyone' }]])(
		'rejects %j with 400 and does not query',
		async (query) => {
			expect(await call(query)).toBe(400);
			expect(faucetToLedger).not.toHaveBeenCalled();
		}
	);

	it('with authentication on, answers 403 without admin:analytics:read and never queries', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		expect(await call({}, ['read:account', 'admin:customers:read'])).toBe(403);
		expect(faucetToLedger).not.toHaveBeenCalled();
		expect(await call({}, ['admin:analytics:read'])).toBe(200);
	});
});
