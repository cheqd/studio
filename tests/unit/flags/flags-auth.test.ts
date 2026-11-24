import { describe, expect, it, jest } from '@jest/globals';
import { staffIdentity } from '../admin/staff-identity-fixture.js';
import type { Request, Response } from 'express';

const upsert = jest.fn(async (write: unknown) => ({ flag: { id: 'row', ...(write as object) }, previous: null }));
const flagsFor = jest.fn(async () => ({ ui: 'classic' }));
const rowsFor = jest.fn();

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: {} } },
}));

const { FeatureFlagService } = await import('../../../src/services/api/feature-flag.js');
FeatureFlagService.instance.setFlag = upsert as never;
FeatureFlagService.instance.flagsFor = flagsFor as never;
FeatureFlagService.instance.rowsFor = rowsFor as never;

const { AuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rule-repository.js');
const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');
const { FlagsAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/flags-auth.js');
const { AccountAuthProvider } = await import('../../../src/middleware/auth/routes/api/account-auth.js');
const { FlagsAdminController } = await import('../../../src/controllers/admin/flags.js');
const { FlagsController } = await import('../../../src/controllers/api/flags.js');
const { CredentialScreensService } = await import('../../../src/services/api/credential-screens.js');
CredentialScreensService.instance.decide = (async () => ({ enabled: false, mode: 'auto', source: 'default' })) as never;

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
		const res = fakeResponse({ scopes: ['admin:flags:update'], staffIdentity: staffIdentity() });
		await new FlagsAdminController().putFlag(
			requestFor('PUT', '/admin/flags', { ...body, value: { engine: 'nope' } }),
			res as unknown as Response
		);
		expect(res.statusCode).toBe(400);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('stores a valid change for staff through setFlag, which audits in the same transaction', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		const res = fakeResponse({
			scopes: ['admin:flags:update'],
			staffIdentity: staffIdentity(),
			user: { logToId: 'staff-1' },
		});
		await new FlagsAdminController().putFlag(requestFor('PUT', '/admin/flags', body), res as unknown as Response);
		expect(res.statusCode).toBe(200);
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({ flagKey: 'engine', customerId: null, reason: 'reset' }),
			'staff-1'
		);
	});

	it('answers 500 and stores nothing when the transactional write fails', async () => {
		process.env.ENABLE_AUTHENTICATION = 'true';
		upsert.mockRejectedValueOnce(new Error('audit insert failed'));
		const res = fakeResponse({
			scopes: ['admin:flags:update'],
			staffIdentity: staffIdentity(),
			user: { logToId: 'staff-1' },
		});
		await new FlagsAdminController().putFlag(requestFor('PUT', '/admin/flags', body), res as unknown as Response);
		expect(res.statusCode).toBe(500);
	});
});

describe('GET /flags controller', () => {
	it('returns the flags for the calling customer', async () => {
		const res = fakeResponse({ customer: { customerId: 'c1' } });
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(flagsFor).toHaveBeenCalledWith('c1');
		expect(res.statusCode).toBe(200);
	});

	it("includes the caller's own customerId and nothing else about the account", async () => {
		const res = fakeResponse({ customer: { customerId: 'c1', email: 'x@example.com', name: 'X' } });
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(res.body).toEqual({ ui: 'classic', credentialScreens: false, customerId: 'c1' });
	});

	it('omits customerId (not null) when the request has no customer', async () => {
		const res = fakeResponse({});
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(res.statusCode).toBe(200);
		expect(res.body).toEqual({ ui: 'classic', credentialScreens: false });
		expect(Object.keys(res.body as object)).not.toContain('customerId');
	});

	it('still includes customerId when the flag store is unavailable', async () => {
		flagsFor.mockRejectedValueOnce(new Error('down') as never);
		const res = fakeResponse({ customer: { customerId: 'c1' } });
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(res.body).toMatchObject({ customerId: 'c1', ui: 'classic' });
	});

	it('answers with defaults (ui classic, credo) when the flag store is unavailable', async () => {
		flagsFor.mockRejectedValueOnce(new Error('relation "featureFlag" does not exist') as never);
		const res = fakeResponse({ customer: { customerId: 'c1' } });
		await new FlagsController().getFlags(requestFor('GET', '/flags'), res as unknown as Response);
		expect(res.statusCode).toBe(200);
		expect(res.body).toMatchObject({ ui: 'classic', engine: { default: 'credo' } });
	});
});
