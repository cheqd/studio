import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { staffIdentity } from '../admin/staff-identity-fixture.js';

const readRows = jest.fn<(customerId: string) => Promise<unknown[]>>();
jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));
const actual = await import('../../../src/services/api/feature-flag.js');
jest.unstable_mockModule('../../../src/services/api/feature-flag.js', () => ({
	...actual,
	FeatureFlagService: { instance: { readRows } },
}));
const { FlagsAdminController } = await import('../../../src/controllers/admin/flags.js');

const customerId = '11111111-1111-4111-8111-111111111111';
const staffLocals = () => ({ scopes: ['admin:customers:read'], staffIdentity: staffIdentity() });

function call(params: Record<string, string>, locals: Record<string, unknown>) {
	const response = {
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
	return new FlagsAdminController()
		.getCustomerFlags({ params } as unknown as Request, response as unknown as Response)
		.then(() => response);
}

const envBefore = { ...process.env };
beforeEach(() => {
	process.env.ENABLE_AUTHENTICATION = 'true';
	readRows.mockReset();
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	process.env = { ...envBefore };
	jest.restoreAllMocks();
});

const row = (customer: string | null, route: string | null, engine: string) => ({
	customerId: customer,
	flagKey: 'engine',
	route,
	value: { engine },
	updatedAt: new Date('2026-11-23T10:00:00Z'),
	updatedBy: 'logto-staff-1',
});

describe('GET /admin/customers/{id}/flags', () => {
	it('returns the defaults and no rows for a customer with no flags', async () => {
		readRows.mockResolvedValue([]);
		const res = await call({ id: customerId }, staffLocals());
		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ customerId, rows: [], effective: { engine: { default: 'credo' } } });
		expect(readRows).toHaveBeenCalledWith(customerId);
	});

	it('lists global and customer rows, and keeps credo effective while the override is off', async () => {
		delete process.env.VERAMO_NEW_ARTEFACT_OVERRIDE;
		readRows.mockResolvedValue([row(customerId, null, 'veramo')]);
		const res = await call({ id: customerId }, staffLocals());
		const body = res.body as {
			rows: Array<Record<string, unknown>>;
			effective: { engine: { default: string } };
			overrideEnabled: boolean;
		};
		expect(body.overrideEnabled).toBe(false);
		expect(body.effective.engine.default).toBe('credo');
		expect(body.rows).toEqual([
			{
				scope: 'customer',
				flagKey: 'engine',
				route: null,
				value: { engine: 'veramo' },
				updatedAt: new Date('2026-11-23T10:00:00Z'),
			},
		]);
		// the staff member's id is not exposed
		expect(JSON.stringify(body)).not.toContain('logto-staff-1');
	});

	it('shows veramo as effective when the override is on and a row says veramo', async () => {
		process.env.VERAMO_NEW_ARTEFACT_OVERRIDE = 'true';
		readRows.mockResolvedValue([row(customerId, 'did', 'veramo'), row(null, null, 'credo')]);
		const res = await call({ id: customerId }, staffLocals());
		const body = res.body as {
			effective: { engine: { default: string; routes: Record<string, string> } };
			overrideEnabled: boolean;
			rows: Array<{ scope: string }>;
		};
		expect(body.overrideEnabled).toBe(true);
		expect(body.effective.engine.routes.did).toBe('veramo');
		expect(body.effective.engine.default).toBe('credo');
		expect(body.rows.map((r) => r.scope).sort()).toEqual(['customer', 'global']);
	});

	it('refuses a non-UUID id without reading', async () => {
		const res = await call({ id: '../flags' }, staffLocals());
		expect(res.statusCode).toBe(400);
		expect(readRows).not.toHaveBeenCalled();
	});

	it('refuses callers who are not staff without reading', async () => {
		for (const locals of [
			{ scopes: ['admin:customers:read'], staffIdentity: staffIdentity({ email: 'someone@example.com' }) },
			{ scopes: ['read:account'], staffIdentity: staffIdentity() },
			{ scopes: ['admin:customers:read'] },
		]) {
			const res = await call({ id: customerId }, locals);
			expect(res.statusCode).toBe(403);
		}
		expect(readRows).not.toHaveBeenCalled();
	});

	it('answers the defaults when the flag table cannot be read', async () => {
		readRows.mockRejectedValue(new Error('relation "featureFlag" does not exist'));
		const res = await call({ id: customerId }, staffLocals());
		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ rows: [], effective: { engine: { default: 'credo' } } });
	});
});
