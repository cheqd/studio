import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
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
			},
		},
	},
}));

const { requireStaffScope, resetStaffDenialThrottle, STAFF_SCOPES } =
	await import('../../../src/controllers/admin/staff-guard.js');
const { APIGuard } = await import('../../../src/middleware/auth/auth-gaurd.js');

/** Lets the fire-and-forget audit write finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

function fakeResponse(locals: Record<string, unknown>, request?: Partial<Request>) {
	return {
		locals,
		req: request,
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
		send(body: unknown) {
			this.body = body;
			return this;
		},
	};
}

const original = process.env.ENABLE_AUTHENTICATION;
beforeEach(() => {
	process.env.ENABLE_AUTHENTICATION = 'true';
	auditRows.length = 0;
	resetStaffDenialThrottle();
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
	else process.env.ENABLE_AUTHENTICATION = original;
	jest.restoreAllMocks();
});

describe('staff.access.denied from the staff policy check in the admin controllers', () => {
	const request = { method: 'GET', path: '/admin/customers', headers: {} } as unknown as Request;
	const nonStaff = () =>
		fakeResponse(
			{
				scopes: [STAFF_SCOPES.customersRead],
				staffIdentity: staffIdentity({ logtoUserId: 'logto-user-7', email: 'someone@example.com', roles: [] }),
			},
			request
		);

	it('records the refused caller with its Logto id, the route and the reason, and no email', async () => {
		const response = nonStaff();
		expect(requireStaffScope(response as unknown as Response, STAFF_SCOPES.customersRead)).toBe(false);
		expect(response.statusCode).toBe(403);
		await settle();
		expect(auditRows).toHaveLength(1);
		expect(auditRows[0]).toMatchObject({
			actorUserId: 'logto-user-7',
			action: 'staff.access.denied',
			metadata: { route: 'GET /admin/customers' },
		});
		expect(typeof auditRows[0].reason).toBe('string');
		expect(JSON.stringify(auditRows)).not.toContain('@');
	});

	it('writes the same caller, route and reason once a minute at most', async () => {
		for (let i = 0; i < 5; i++) requireStaffScope(nonStaff() as unknown as Response, STAFF_SCOPES.customersRead);
		await settle();
		expect(auditRows).toHaveLength(1);
	});

	it('writes nothing for staff', async () => {
		const response = fakeResponse(
			{ scopes: [STAFF_SCOPES.customersRead], staffIdentity: staffIdentity() },
			request
		);
		expect(requireStaffScope(response as unknown as Response, STAFF_SCOPES.customersRead)).toBe(true);
		await settle();
		expect(auditRows).toHaveLength(0);
	});
});

describe('staff.access.denied from the auth guard (a caller without the admin scopes)', () => {
	function guardFor(validScopes: boolean) {
		const rule = { isAllowedUnauthorized: () => false, areValidScopes: () => validScopes };
		const guard = new APIGuard({ match: () => rule } as never, {} as never);
		jest.spyOn(
			guard as unknown as { chooseUserFetcherStrategy: () => string },
			'chooseUserFetcherStrategy'
		).mockImplementation(() => {
			guard.setUserInfoStrategy({ fetch: async () => undefined } as never);
			return 'portal';
		});
		return guard;
	}

	async function call(path: string, validScopes = false) {
		const request = { method: 'GET', path, headers: {}, user: { isAuthenticated: true } } as unknown as Request;
		const response = fakeResponse({ scopes: [], user: { logToId: 'logto-user-9' } });
		const next = jest.fn() as unknown as NextFunction;
		await guardFor(validScopes).guard(request, response as unknown as Response, next);
		await settle();
		return { response, next };
	}

	it('records a non-staff call to an /admin route and still answers 403', async () => {
		const { response } = await call('/admin/analytics/overview');
		expect(response.statusCode).toBe(403);
		expect(auditRows).toEqual([
			expect.objectContaining({
				actorUserId: 'logto-user-9',
				action: 'staff.access.denied',
				reason: 'missing-scope',
				metadata: { route: 'GET /admin/analytics/overview', reasonCode: 'missing-scope' },
			}),
		]);
	});

	it('records nothing for a refused call outside /admin, or an allowed call', async () => {
		expect((await call('/credential/issue')).response.statusCode).toBe(403);
		expect((await call('/admin/analytics/overview', true)).next).toHaveBeenCalled();
		expect(auditRows).toHaveLength(0);
	});
});
