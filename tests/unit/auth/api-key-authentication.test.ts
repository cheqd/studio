import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));

const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const { APIKeyService } = await import('../../../src/services/admin/api-key.js');
const { InvalidAPIKeyError } = await import('../../../src/services/admin/api-key-errors.js');
const { APIGuard } = await import('../../../src/middleware/auth/auth-gaurd.js');
const { AuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rule-repository.js');
const { AuthInfoProvider } = await import('../../../src/middleware/auth/routes/api/auth-user-info.js');
const { AccountAuthProvider } = await import('../../../src/middleware/auth/routes/api/account-auth.js');
const { KeyAuthProvider } = await import('../../../src/middleware/auth/routes/api/key-auth.js');
const { DidAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/did-auth.js');
const { ResourceAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/resource-auth.js');
const { CredentialAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/credential-auth.js');
const { CredentialStatusAuthRuleProvider } =
	await import('../../../src/middleware/auth/routes/api/credential-status-auth.js');
const { PresentationAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/presentation-auth.js');
const { AccreditationAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/accreditation-auth.js');
const { EventAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/event-auth.js');
const { AgentAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/agent-auth.js');
const { FlagsAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/flags-auth.js');
const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');
const { ProvidersAuthRuleProvider } = await import('../../../src/middleware/auth/routes/api/provider-auth.js');

const NOW = new Date('2030-06-15T12:00:00.000Z');
const KEY = 'caas_test-key-not-a-secret';
const HOUR = 60 * 60 * 1000;

type Row = { revoked: boolean; expiresAt: Date | null; apiKeyHash: string; user: object; customer: object };
const row = (over: Partial<Row> = {}): Row => ({
	revoked: false,
	expiresAt: new Date(NOW.getTime() + HOUR),
	apiKeyHash: 'hash',
	user: { logToId: 'user-1' },
	customer: { customerId: 'customer-1' },
	...over,
});

const findOne = jest.fn<(opts: unknown) => Promise<Row | null>>();
let warn: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
	jest.useFakeTimers({ now: NOW });
	findOne.mockReset();
	(APIKeyService.instance as unknown as { apiKeyRepository: unknown }).apiKeyRepository = { findOne };
	jest.spyOn(APIKeyService, 'compareAPIKey').mockResolvedValue(true);
	warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
});

async function rejection(promise: Promise<unknown>): Promise<Error> {
	try {
		await promise;
	} catch (error) {
		return error as Error;
	}
	throw new Error('expected a rejection');
}

describe('APIKeyService.authenticate', () => {
	it('accepts a valid key', async () => {
		findOne.mockResolvedValue(row());
		await expect(APIKeyService.instance.authenticate(KEY)).resolves.toMatchObject({ revoked: false });
	});

	it('rejects an expired key with the same error as an unknown key, and logs a non-secret reason', async () => {
		findOne.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() - 1) }));
		const expired = await rejection(APIKeyService.instance.authenticate(KEY));
		findOne.mockResolvedValue(null);
		const unknown = await rejection(APIKeyService.instance.authenticate(KEY));
		expect(expired).toBeInstanceOf(InvalidAPIKeyError);
		expect(expired.message).toBe(unknown.message);
		expect(expired.message).toBe('Invalid API key');
		const logged = warn.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
		expect(logged).toMatch(/rejected: expired \(key [0-9a-f]{8}\)/);
		expect(logged).not.toContain(KEY);
	});

	it('rejects a key at the exact instant it expires', async () => {
		findOne.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime()) }));
		expect(await rejection(APIKeyService.instance.authenticate(KEY))).toBeInstanceOf(InvalidAPIKeyError);
	});

	it('accepts a key one millisecond before it expires', async () => {
		findOne.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() + 1) }));
		await expect(APIKeyService.instance.authenticate(KEY)).resolves.toBeDefined();
	});

	it('rejects a key with no expiry: the column is not nullable, so null is never "no expiry"', async () => {
		findOne.mockResolvedValue(row({ expiresAt: null }));
		expect(await rejection(APIKeyService.instance.authenticate(KEY))).toBeInstanceOf(InvalidAPIKeyError);
	});

	it('rejects a revoked key', async () => {
		findOne.mockResolvedValue(row({ revoked: true }));
		const error = await rejection(APIKeyService.instance.authenticate(KEY));
		expect(error.message).toBe('API key is revoked');
	});

	it('rejects a key that is both revoked and expired', async () => {
		findOne.mockResolvedValue(row({ revoked: true, expiresAt: new Date(NOW.getTime() - HOUR) }));
		expect(await rejection(APIKeyService.instance.authenticate(KEY))).toBeInstanceOf(InvalidAPIKeyError);
	});

	it('does not keep honouring a key it accepted earlier: every call reads the row again', async () => {
		findOne.mockResolvedValue(row());
		await expect(APIKeyService.instance.authenticate(KEY)).resolves.toBeDefined();

		// revoked in the database between two requests
		findOne.mockResolvedValue(row({ revoked: true }));
		expect(await rejection(APIKeyService.instance.authenticate(KEY))).toBeInstanceOf(InvalidAPIKeyError);

		// the same row, once the server clock passes its expiry
		findOne.mockResolvedValue(row());
		await expect(APIKeyService.instance.authenticate(KEY)).resolves.toBeDefined();
		jest.setSystemTime(new Date(NOW.getTime() + HOUR));
		expect(await rejection(APIKeyService.instance.authenticate(KEY))).toBeInstanceOf(InvalidAPIKeyError);
		expect(findOne).toHaveBeenCalledTimes(4);
	});

	it('still lets management read an expired key, so an administrator can extend or revoke it', async () => {
		findOne.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() - HOUR) }));
		await expect(APIKeyService.instance.get(KEY)).resolves.toBeDefined();
	});
});

describe('API key authentication on every route family', () => {
	const repository = new AuthRuleRepository();
	for (const provider of [
		new AuthInfoProvider(),
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
		new ProvidersAuthRuleProvider(),
	]) {
		repository.push(provider);
	}
	let grantedScopes: string[] = [];
	const oauth = {
		getUserScopes: async () => ({ status: 200, data: grantedScopes }),
	} as unknown as ConstructorParameters<typeof APIGuard>[1];

	// Every guarded route in the contract inventory, which is generated from the auth rules.
	const inventory = JSON.parse(readFileSync(join(process.cwd(), 'tests/contract/inventory/routes.json'), 'utf8')) as {
		routes: { method: string; path: string; auth: string; scopes: string[] }[];
	};
	const requestFor = (route: { method: string; path: string }) =>
		({
			method: route.method,
			path: route.path.replace(/:[A-Za-z0-9_]+/g, 'x'),
			headers: { 'x-api-key': KEY },
			body: { network: 'testnet' },
			user: { isAuthenticated: false },
		}) as unknown as Request;
	const scoped = inventory.routes.filter((r) => r.auth === 'scoped' && repository.match(requestFor(r)) !== null);

	async function run(route: { method: string; path: string; scopes: string[] }) {
		const guard = new APIGuard(repository, oauth);
		grantedScopes = route.scopes;
		const request = requestFor(route);
		const response = {
			locals: {} as Record<string, unknown>,
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		};
		const next = jest.fn();
		await guard.guard(request, response as unknown as Response, next as unknown as NextFunction);
		return { response, next };
	}

	it('covers a meaningful number of guarded routes', () => {
		expect(scoped.length).toBeGreaterThan(95);
	});

	it('lets a valid key through on every guarded route', async () => {
		findOne.mockResolvedValue(row());
		for (const route of scoped) {
			const { response, next } = await run(route);
			expect({ route: `${route.method} ${route.path}`, status: response.status.mock.calls[0]?.[0] }).toEqual({
				route: `${route.method} ${route.path}`,
				status: undefined,
			});
			expect(next).toHaveBeenCalledTimes(1);
		}
	});

	it.each([
		['expired', row({ expiresAt: new Date(NOW.getTime() - 1) }), 'Unauthorized error: Invalid API key.'],
		['expiring exactly now', row({ expiresAt: new Date(NOW.getTime()) }), 'Unauthorized error: Invalid API key.'],
		['revoked', row({ revoked: true }), 'Unauthorized error: API key is revoked.'],
	])('answers 401 on every guarded route for a key that is %s', async (_label, stored, message) => {
		findOne.mockResolvedValue(stored);
		for (const route of scoped) {
			const { response, next } = await run(route);
			expect({ route: `${route.method} ${route.path}`, status: response.status.mock.calls[0]?.[0] }).toEqual({
				route: `${route.method} ${route.path}`,
				status: 401,
			});
			expect(response.json).toHaveBeenCalledWith({ error: message });
			expect(next).not.toHaveBeenCalled();
		}
	});
});
