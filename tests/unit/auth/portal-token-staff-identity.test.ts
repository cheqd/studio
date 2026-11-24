import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

type Payload = Record<string, unknown>;
const tokens: Record<string, Payload> = {};

jest.unstable_mockModule('jose', () => ({
	jwtVerify: jest.fn(async (token: string) => {
		if (!tokens[token]) throw new Error('bad token');
		return { payload: tokens[token] };
	}),
	createRemoteJWKSet: jest.fn(() => ({})),
}));

const { PortalUserInfoFetcher, resetPortalAudienceWarningForTests } =
	await import('../../../src/middleware/auth/user-info-fetcher/portal-token.js');

const ok = (data: unknown) => ({ status: 200, error: '', data });
let userScopes: string[];
let roleLookup: () => Promise<{ status: number; error: string; data: unknown }>;
const provider = {
	endpoint_issuer: 'https://issuer.example/oidc',
	endpoint_jwks: 'https://issuer.example/oidc/jwks',
	getUserScopes: async () => ok(userScopes),
	getUserRoles: () => roleLookup(),
} as never;

function newResponse() {
	return { locals: {}, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as unknown as Response;
}

async function run(idPayload: Payload, m2mScope: string) {
	tokens['id-token'] = idPayload;
	tokens['m2m-token'] = { sub: 'portal-client', scope: m2mScope };
	const fetcher = new PortalUserInfoFetcher('m2m-token', 'id-token', provider);
	fetcher.setUserEntity = (async () => undefined) as never;
	const response = newResponse();
	const result = await fetcher.fetch({ headers: {} } as Request, response);
	return { result, locals: response.locals as Record<string, any> };
}

beforeEach(() => {
	userScopes = ['admin:subscription:get'];
	roleLookup = async () => ok(['Portal']);
});

describe('portal path scopes (F-29)', () => {
	it('never takes a staff scope from the M2M token', async () => {
		const { locals } = await run(
			{ sub: 'user-1' },
			'admin:customers:read admin:analytics:read admin:audit:read admin:organisation:delete admin:flags:update admin:future:thing customers:read'
		);
		expect(locals.scopes).toEqual(['admin:subscription:get', 'customers:read']);
	});

	it('still takes the non-staff scopes of the M2M token, customer-facing admin ones included', async () => {
		const { locals } = await run({ sub: 'user-1' }, 'admin:api-key:list admin:organisation:get create:did');
		expect(locals.scopes).toEqual(
			expect.arrayContaining([
				'admin:subscription:get',
				'admin:api-key:list',
				'admin:organisation:get',
				'create:did',
			])
		);
	});

	it('keeps a staff scope the user holds through their own Logto role', async () => {
		userScopes = ['admin:customers:read'];
		const { locals } = await run({ sub: 'user-1' }, 'admin:customers:read');
		expect(locals.scopes).toEqual(['admin:customers:read']);
	});
});

describe('portal path staff identity', () => {
	it('records verified token claims, Management API roles and the user session marker', async () => {
		roleLookup = async () => ok(['cheqd admin']);
		const { result, locals } = await run(
			{ sub: 'user-1', email: 'person@example.com', email_verified: true, roles: ['stale-claim'] },
			''
		);
		expect(result).toBeUndefined();
		expect(locals.staffIdentity).toEqual({
			logtoUserId: 'user-1',
			email: 'person@example.com',
			emailVerified: true,
			roles: ['cheqd admin'],
			authMethod: 'portal-user-session',
		});
	});

	it('uses the token roles claim only when the Management API lookup fails', async () => {
		roleLookup = async () => ({ status: 502, error: 'down', data: {} });
		const { locals } = await run(
			{ sub: 'user-1', email: 'person@example.com', email_verified: true, roles: ['cheqd admin'] },
			''
		);
		expect(locals.staffIdentity.roles).toEqual(['cheqd admin']);
	});

	it('leaves data undefined when it is absent or of the wrong type', async () => {
		roleLookup = async () => {
			throw new Error('down');
		};
		const { locals } = await run({ sub: 'user-1', email: 42, email_verified: 'yes' }, '');
		expect(locals.staffIdentity).toMatchObject({ email: undefined, emailVerified: undefined, roles: undefined });
	});

	it('does not mark a session whose M2M token fails verification', async () => {
		tokens['id-token'] = { sub: 'user-1' };
		delete tokens['m2m-token'];
		const fetcher = new PortalUserInfoFetcher('m2m-token', 'id-token', provider);
		fetcher.setUserEntity = (async () => undefined) as never;
		const response = newResponse();
		await fetcher.fetch({ headers: {} } as Request, response);
		expect((response.locals as any).staffIdentity.authMethod).toBeUndefined();
	});
});

describe('portal ID token audience', () => {
	const original = process.env.PORTAL_APP_IDS;
	afterEach(() => {
		if (original === undefined) delete process.env.PORTAL_APP_IDS;
		else process.env.PORTAL_APP_IDS = original;
	});

	async function runWithAudience(aud: unknown) {
		const payload: Payload = { sub: 'user-1' };
		if (aud !== undefined) payload.aud = aud;
		tokens['id-token'] = payload;
		tokens['m2m-token'] = { sub: 'portal-client', scope: '' };
		const fetcher = new PortalUserInfoFetcher('m2m-token', 'id-token', provider);
		fetcher.setUserEntity = (async () => undefined) as never;
		const response = newResponse();
		const result = await fetcher.fetch({ headers: {} } as Request, response);
		return { result, response };
	}

	it('accepts a matching string audience', async () => {
		process.env.PORTAL_APP_IDS = 'portal-app, other-app';
		const { response } = await runWithAudience('portal-app');
		expect(response.status).not.toHaveBeenCalled();
		expect((response.locals as Record<string, any>).staffIdentity.authMethod).toBeDefined();
	});

	it('accepts an audience array that includes a configured id', async () => {
		process.env.PORTAL_APP_IDS = 'portal-app';
		const { response } = await runWithAudience(['https://api.example', 'portal-app']);
		expect(response.status).not.toHaveBeenCalled();
	});

	it('rejects a token issued to another application with 401', async () => {
		process.env.PORTAL_APP_IDS = 'portal-app';
		const { response } = await runWithAudience('another-app');
		expect(response.status).toHaveBeenCalledWith(401);
		expect((response.locals as Record<string, any>).staffIdentity).toBeUndefined();
	});

	it('rejects a token with no audience with 401', async () => {
		process.env.PORTAL_APP_IDS = 'portal-app';
		const { response } = await runWithAudience(undefined);
		expect(response.status).toHaveBeenCalledWith(401);
	});

	it('does not enforce the audience when unset, with a one-off warning', async () => {
		delete process.env.PORTAL_APP_IDS;
		resetPortalAudienceWarningForTests();
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { response } = await runWithAudience('another-app');
		await runWithAudience('another-app');
		expect(response.status).not.toHaveBeenCalled();
		expect(warn.mock.calls.filter((call) => String(call[0]).includes('PORTAL_APP_IDS'))).toHaveLength(1);
		warn.mockRestore();
	});
});
