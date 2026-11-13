import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const upsert = jest.fn(async (write: unknown) => ({ id: 'row', ...(write as object) }));
const flagsFor = jest.fn(async () => ({ ui: 'classic' }));
const rowsFor = jest.fn();

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: {} } },
}));

const { FeatureFlagService } = await import('../../../src/services/api/feature-flag.js');
FeatureFlagService.instance.upsert = upsert as never;
FeatureFlagService.instance.flagsFor = flagsFor as never;
FeatureFlagService.instance.rowsFor = rowsFor as never;

const { AuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rule-repository.js');
const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');
const { FlagsAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/flags-auth.js');
const { AccountAuthProvider } = await import('../../../src/middleware/auth/routes/api/account-auth.js');
const { FlagsAdminController } = await import('../../../src/controllers/admin/flags.js');
const { FlagsController } = await import('../../../src/controllers/api/flags.js');

const requestFor = (method: string, path: string, body?: unknown) => ({ method, path, body }) as unknown as Request;

function fakeResponse(locals: Record<string, unknown> = {}) {
	const res = { locals, statusCode: 0, body: undefined as unknown } as {
		locals: Record<string, unknown>;
		statusCode: number;
		body: unknown;
		status: (code: number) => unknown;
		json: (body: unknown) => unknown;
	};
	res.status = (code: number) => ((res.statusCode = code), res);
	res.json = (body: unknown) => ((res.body = body), res);
	return res;
}

describe('flag auth rules', () => {
	const repository = new AuthRuleRepository();
	repository.push(new AccountAuthProvider());
	repository.push(new FlagsAuthRuleProvider());
	repository.push(new AdminAuthRuleProvider());

	it('GET /flags needs read:flags and is not open to anonymous callers', () => {
		const rule = repository.match(requestFor('GET', '/flags'));
		expect(rule?.isValidScope('read:flags')).toBe(true);
		expect(rule?.areValidScopes(['admin:flags:update'])).toBe(false);
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});

	it('PUT /admin/flags needs the staff scope admin:flags:update', () => {
		const rule = repository.match(requestFor('PUT', '/admin/flags'));
		expect(rule?.isValidScope('admin:flags:update')).toBe(true);
		expect(rule?.areValidScopes(['read:flags', 'admin:organisation:update'])).toBe(false);
		expect(rule?.isAllowedUnauthorized()).toBe(false);
	});

	it('anchored rules do not match look-alike paths or other methods', () => {
		for (const [method, path] of [
			['GET', '/admin/flags'],
			['GET', '/flags/extra'],
			['GET', '/x/flags'],
			['PUT', '/admin/flags/1'],
			['PUT', '/flags'],
			['POST', '/admin/flags'],
			['DELETE', '/admin/flags'],
		]) {
			expect(repository.match(requestFor(method, path))).toBeNull();
		}
	});
});

describe('PUT /admin/flags controller', () => {
	const body = { flagKey: 'engine', value: { engine: 'veramo' }, reason: 'reset' };

	it('rejects a caller without the staff scope when authentication is on', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		const res = fakeResponse({ scopes: ['read:flags'] });
		await new FlagsAdminController().putFlag(requestFor('PUT', '/admin/flags', body), res as unknown as Response);
		expect(res.statusCode).toBe(403);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('rejects an invalid body with 400 and writes nothing', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		const res = fakeResponse({ scopes: ['admin:flags:update'] });
		await new FlagsAdminController().putFlag(
			requestFor('PUT', '/admin/flags', { ...body, value: { engine: 'nope' } }),
			res as unknown as Response
		);
		expect(res.statusCode).toBe(400);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('stores a valid change for staff and logs an audit record', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
		const res = fakeResponse({ scopes: ['admin:flags:update'], user: { logToId: 'staff-1' } });
		await new FlagsAdminController().putFlag(requestFor('PUT', '/admin/flags', body), res as unknown as Response);
		expect(res.statusCode).toBe(200);
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({ flagKey: 'engine', customerId: null }),
			'staff-1'
		);
		const audit = JSON.parse(info.mock.calls[0][0] as string);
		expect(audit).toMatchObject({
			event: 'admin-audit',
			action: 'flag.set',
			actorUserId: 'staff-1',
			reason: 'reset',
		});
		info.mockRestore();
	});
});

describe('GET /flags controller', () => {
	it('returns the flags for the calling customer', async () => {
		const res = fakeResponse({ customer: { customerId: 'c1' } });
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(flagsFor).toHaveBeenCalledWith('c1');
		expect(res.statusCode).toBe(200);
	});

	it('answers with defaults (ui classic, veramo) when the flag store is unavailable', async () => {
		flagsFor.mockRejectedValueOnce(new Error('relation "featureFlag" does not exist') as never);
		const res = fakeResponse({ customer: { customerId: 'c1' } });
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ ui: 'classic', engine: { default: 'veramo' } });
	});
});
