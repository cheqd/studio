import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const jwtVerifyMock = jest.fn(async () => ({ payload: { sub: 'client', scope: 'read:account' } }));
jest.unstable_mockModule('jose', () => ({
	jwtVerify: jwtVerifyMock,
	createRemoteJWKSet: jest.fn(() => ({})),
}));

const apiKeyFetch = jest.fn(async (_request: unknown, response: { locals: { scopes?: string[] } }) => {
	response.locals.scopes = ['read:account'];
	return undefined;
});
jest.unstable_mockModule('../../../src/middleware/auth/user-info-fetcher/api-token.js', () => ({
	APITokenUserInfoFetcher: class {
		fetch = apiKeyFetch;
	},
}));

const { APIGuard } = await import('../../../src/middleware/auth/auth-gaurd.js');
const { AuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rule-repository.js');
const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');
const { AccountAuthProvider } = await import('../../../src/middleware/auth/routes/api/account-auth.js');
const { m2mCustomerPathEnabled, warnIfM2MCustomerPathEnabled } =
	await import('../../../src/middleware/auth/m2m-customer-path.js');

const provider = {
	endpoint_issuer: 'https://issuer.example/oidc',
	endpoint_jwks: 'https://issuer.example/oidc/jwks',
	getUserScopes: jest.fn(async () => ({ status: 500 })),
} as unknown as ConstructorParameters<typeof APIGuard>[1];

function build() {
	const repository = new AuthRuleRepository();
	repository.push(new AdminAuthRuleProvider());
	repository.push(new AccountAuthProvider());
	return new APIGuard(repository, provider);
}

function run(headers: Record<string, string>, path = '/account', method = 'GET') {
	const request = { method, path, headers, user: { isAuthenticated: false } } as unknown as Request;
	const response = {
		locals: {},
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
	const next = jest.fn();
	return build()
		.guard(request, response as unknown as Response, next as never)
		.then(() => ({ response, next }));
}

const original = process.env.ENABLE_M2M_CUSTOMER_PATH;
beforeEach(() => {
	jest.clearAllMocks();
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	delete process.env.ENABLE_M2M_CUSTOMER_PATH;
});
afterEach(() => {
	jest.restoreAllMocks();
	if (original === undefined) delete process.env.ENABLE_M2M_CUSTOMER_PATH;
	else process.env.ENABLE_M2M_CUSTOMER_PATH = original;
});

describe('direct customer path setting', () => {
	it('is disabled by default', () => {
		expect(m2mCustomerPathEnabled()).toBe(false);
	});

	it('is enabled only by the exact string true', () => {
		process.env.ENABLE_M2M_CUSTOMER_PATH = 'true';
		expect(m2mCustomerPathEnabled()).toBe(true);
	});

	it.each(['TRUE', 'True', '1', 'yes', ' true', 'true ', 'false', '', 'on'])('stays disabled for %j', (value) => {
		process.env.ENABLE_M2M_CUSTOMER_PATH = value;
		expect(m2mCustomerPathEnabled()).toBe(false);
	});

	it('logs a startup warning only when enabled', () => {
		warnIfM2MCustomerPathEnabled();
		expect(console.warn).not.toHaveBeenCalled();
		process.env.ENABLE_M2M_CUSTOMER_PATH = 'true';
		warnIfM2MCustomerPathEnabled();
		expect(console.warn).toHaveBeenCalledTimes(1);
	});
});

describe('guard with the direct customer path disabled', () => {
	it('refuses a customer-id header with a bearer token with 401 and verifies nothing', async () => {
		const { response, next } = await run({ authorization: 'Bearer secret-token-value', 'customer-id': 'victim' });
		expect(response.statusCode).toBe(401);
		expect(response.body).toEqual({ error: 'Unauthorized error: Authentication failed.' });
		expect(jwtVerifyMock).not.toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});

	it('logs one line with the reason and no token content', async () => {
		await run({ authorization: 'Bearer secret-token-value', 'customer-id': 'victim' });
		expect(console.warn).toHaveBeenCalledTimes(1);
		const line = String((console.warn as unknown as jest.Mock).mock.calls[0].join(' '));
		expect(line).toContain('m2m-customer-path-disabled');
		expect(line).not.toContain('secret-token-value');
	});

	it('refuses for malformed setting values too', async () => {
		process.env.ENABLE_M2M_CUSTOMER_PATH = 'TRUE';
		const { response } = await run({ authorization: 'Bearer t', 'customer-id': 'victim' });
		expect(response.statusCode).toBe(401);
		expect(jwtVerifyMock).not.toHaveBeenCalled();
	});

	it('refuses a staff route the same way, before any scope check', async () => {
		const { response, next } = await run(
			{ authorization: 'Bearer t', 'customer-id': 'victim' },
			'/admin/organisation/delete',
			'DELETE'
		);
		expect([response.statusCode, next.mock.calls.length]).toEqual([401, 0]);
	});

	it('refuses when an id-token accompanies it (no fall-through to the portal strategy)', async () => {
		const { response } = await run({ authorization: 'Bearer t', 'id-token': 'i', 'customer-id': 'victim' });
		expect(response.statusCode).toBe(401);
		expect(jwtVerifyMock).not.toHaveBeenCalled();
	});

	it('lets the API key take precedence when both x-api-key and customer-id are sent', async () => {
		const { response } = await run({ 'x-api-key': 'k', authorization: 'Bearer t', 'customer-id': 'victim' });
		expect(apiKeyFetch).toHaveBeenCalledTimes(1);
		expect(response.statusCode).not.toBe(401);
		expect(jwtVerifyMock).not.toHaveBeenCalled();
	});

	it('does not choose the customer path without a bearer token either: no verification happens', async () => {
		const { response } = await run({ 'customer-id': 'victim' });
		expect(jwtVerifyMock).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(401);
	});

	it('leaves the id-token-only and portal paths on their own strategies', async () => {
		const idToken = await run({ authorization: 'Bearer t' });
		expect(idToken.response.statusCode).not.toBe(0);
		expect((console.warn as unknown as jest.Mock).mock.calls.flat().join(' ')).not.toContain(
			'm2m-customer-path-disabled'
		);
		await run({ authorization: 'Bearer t', 'id-token': 'i' });
		expect((console.warn as unknown as jest.Mock).mock.calls.flat().join(' ')).not.toContain(
			'm2m-customer-path-disabled'
		);
	});

	it('answers a swagger-style request with no headers as before (not refused by the setting)', async () => {
		const { response } = await run({});
		expect(response.statusCode).toBe(401);
		expect((response.body as { error: string }).error).toMatch(/Authorize/);
	});
});

describe('guard with the direct customer path enabled', () => {
	it('still verifies the token and honours the path as before', async () => {
		process.env.ENABLE_M2M_CUSTOMER_PATH = 'true';
		await run({ authorization: 'Bearer t', 'customer-id': 'victim' });
		expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
	});
});
