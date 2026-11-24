import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const { APIGuard } = await import('../../../src/middleware/auth/auth-gaurd.js');
const { AuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rule-repository.js');
const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');
const { APITokenUserInfoFetcher } = await import('../../../src/middleware/auth/user-info-fetcher/api-token.js');
const { PortalUserInfoFetcher } = await import('../../../src/middleware/auth/user-info-fetcher/portal-token.js');
const { IdTokenUserInfoFetcher } = await import('../../../src/middleware/auth/user-info-fetcher/idtoken.js');
const { runWithRequestContext, startRequestContext } = await import('../../../src/services/request-context.js');
const { operationRouting } = await import('../../../src/services/track/operation-routing.js');

const provider = {
	endpoint_issuer: 'https://issuer.example/oidc',
	endpoint_jwks: 'https://issuer.example/oidc/jwks',
} as unknown as ConstructorParameters<typeof APIGuard>[1];

function guard() {
	const repository = new AuthRuleRepository();
	repository.push(new AdminAuthRuleProvider());
	return new APIGuard(repository, provider);
}

/** A fetcher stand-in: succeeds (returns nothing and grants the scope) or answers 401. */
const succeed = async (_q: Request, response: Response) => {
	response.locals.scopes = ['admin:flags:update'];
	return undefined;
};
const refuse = async (_q: Request, response: Response) => response.status(401).json({ error: 'no' });

async function run(headers: Record<string, string>) {
	const context = startRequestContext('req-12345678');
	const request = {
		method: 'PUT',
		path: '/admin/flags',
		headers,
		user: { isAuthenticated: true },
	} as unknown as Request;
	const response = {
		locals: {},
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		send: jest.fn().mockReturnThis(),
	} as unknown as Response;
	const next = jest.fn();
	await runWithRequestContext(context, () => guard().guard(request, response, next as never));
	return { context, next };
}

afterEach(() => {
	jest.restoreAllMocks();
});

describe('the API guard records how the caller authenticated', () => {
	it('records an API key once authentication succeeds', async () => {
		jest.spyOn(APITokenUserInfoFetcher.prototype, 'fetch').mockImplementation(succeed as never);
		const { context, next } = await run({ 'x-api-key': 'k' });
		expect(next).toHaveBeenCalled();
		expect(context.authMethod).toBe('api-key');
	});

	it('records the portal for an ID token plus a bearer token', async () => {
		jest.spyOn(PortalUserInfoFetcher.prototype, 'fetch').mockImplementation(succeed as never);
		const { context } = await run({ authorization: 'Bearer m2m', 'id-token': 'id' });
		expect(context.authMethod).toBe('portal');
	});

	it('records a bare access token', async () => {
		jest.spyOn(IdTokenUserInfoFetcher.prototype, 'fetch').mockImplementation(succeed as never);
		const { context } = await run({ authorization: 'Bearer token' });
		expect(context.authMethod).toBe('id-token');
	});

	it('records nothing when authentication fails', async () => {
		jest.spyOn(APITokenUserInfoFetcher.prototype, 'fetch').mockImplementation(refuse as never);
		const { context, next } = await run({ 'x-api-key': 'k' });
		expect(next).not.toHaveBeenCalled();
		expect(context.authMethod).toBeUndefined();
	});
});

describe('operation rows carry the authentication method', () => {
	const operation = {
		category: 'did',
		name: 'did-create',
		successful: true,
		data: { did: 'did:cheqd:testnet:x' },
	} as never;

	it('takes it from the request context', () => {
		const context = startRequestContext('req-12345678', 1000);
		context.authMethod = 'portal';
		expect(runWithRequestContext(context, () => operationRouting(operation, 1200)).authMethod).toBe('portal');
	});

	it('leaves it empty outside a request', () => {
		expect(operationRouting(operation).authMethod).toBeUndefined();
	});
});
