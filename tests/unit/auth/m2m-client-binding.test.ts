import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

let tokenPayload: Record<string, unknown> = {};
const jwtVerifyMock = jest.fn(async () => ({ payload: tokenPayload }));

jest.unstable_mockModule('jose', () => ({
	jwtVerify: jwtVerifyMock,
	createRemoteJWKSet: jest.fn(() => ({})),
}));

// The real helper pulls in the database layer; only the two methods the fetcher calls are needed.
const setCustomerEntityMock = jest.fn(
	async (_customerId: string, _response: Response): Promise<undefined> => undefined
);
jest.unstable_mockModule('../../../src/middleware/auth/user-info-fetcher/base.js', () => ({
	UserInfoHelper: class {
		setScopes = jest.fn();
		setCustomerEntity = setCustomerEntityMock;
	},
}));

const { M2MCredsTokenUserInfoFetcher } =
	await import('../../../src/middleware/auth/user-info-fetcher/m2m-creds-token.js');

const AUDIENCE = 'https://studio.example/api';
const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const CUSTOMER_1 = 'customer-1';
const CUSTOMER_2 = 'customer-2';

const oauthProvider = {
	endpoint_issuer: 'https://issuer.example/oidc',
	endpoint_jwks: 'https://issuer.example/oidc/jwks',
} as unknown as ConstructorParameters<typeof M2MCredsTokenUserInfoFetcher>[1];

function makeResponse() {
	return {
		locals: {},
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

async function run(customerId: string | string[] | undefined) {
	const request = { headers: { 'customer-id': customerId } } as unknown as Request;
	const response = makeResponse();
	const result = await new M2MCredsTokenUserInfoFetcher('bearer', oauthProvider).fetch(request, response);
	return { result, response };
}

describe('M2M audience, client allowlist and customer binding', () => {
	const setCustomerEntity = setCustomerEntityMock;
	const savedEnv = { ...process.env };

	beforeEach(() => {
		process.env.LOGTO_DEFAULT_RESOURCE_URL = AUDIENCE;
		process.env.M2M_CLIENT_CUSTOMER_MAP = JSON.stringify({ [CLIENT_A]: [CUSTOMER_1] });
		tokenPayload = { sub: CLIENT_A, azp: CLIENT_A, aud: AUDIENCE, scope: 'read' };
		setCustomerEntity.mockClear();
	});

	afterEach(() => {
		process.env = { ...savedEnv };
	});

	function expectRejected(response: ReturnType<typeof makeResponse>, status: number) {
		expect(response.status).toHaveBeenCalledWith(status);
		expect(setCustomerEntity).not.toHaveBeenCalled();
	}

	it('accepts an allowed client acting for a bound customer', async () => {
		const { response } = await run(CUSTOMER_1);
		expect(response.status).not.toHaveBeenCalled();
		expect(setCustomerEntity).toHaveBeenCalledWith(CUSTOMER_1, response);
	});

	it('rejects a token with the wrong audience', async () => {
		tokenPayload.aud = 'https://other.example/api';
		const { response } = await run(CUSTOMER_1);
		expectRejected(response, 401);
	});

	it('rejects a token with no audience', async () => {
		delete tokenPayload.aud;
		const { response } = await run(CUSTOMER_1);
		expectRejected(response, 401);
	});

	it('accepts an audience array that contains the expected audience', async () => {
		tokenPayload.aud = ['https://other.example/api', AUDIENCE];
		const { response } = await run(CUSTOMER_1);
		expect(response.status).not.toHaveBeenCalled();
	});

	it('rejects a client that is not in the allowlist (wrong azp)', async () => {
		tokenPayload.azp = CLIENT_B;
		tokenPayload.sub = CLIENT_B;
		const { response } = await run(CUSTOMER_1);
		expectRejected(response, 403);
	});

	it('rejects a token with no azp or client_id', async () => {
		delete tokenPayload.azp;
		const { response } = await run(CUSTOMER_1);
		expectRejected(response, 403);
	});

	it('rejects an allowed client acting for a customer it is not bound to', async () => {
		const { response } = await run(CUSTOMER_2);
		expectRejected(response, 403);
	});

	it('rejects a missing or repeated customer-id header', async () => {
		expectRejected((await run(undefined)).response, 400);
		setCustomerEntity.mockClear();
		expectRejected((await run([CUSTOMER_1, CUSTOMER_2])).response, 400);
	});

	it('fails closed when the client map is unset', async () => {
		Reflect.deleteProperty(process.env, 'M2M_CLIENT_CUSTOMER_MAP');
		const { response } = await run(CUSTOMER_1);
		expectRejected(response, 403);
	});

	it.each(['', '{}', 'not json', '[]', '{"client-a":[]}', '{"client-a":"customer-1"}', '{"client-a":[1]}'])(
		'fails closed when the client map is empty or malformed: %p',
		async (value) => {
			process.env.M2M_CLIENT_CUSTOMER_MAP = value;
			const { response } = await run(CUSTOMER_1);
			expectRejected(response, 403);
		}
	);

	it('fails closed when the expected audience is not configured', async () => {
		Reflect.deleteProperty(process.env, 'LOGTO_DEFAULT_RESOURCE_URL');
		const { response } = await run(CUSTOMER_1);
		expectRejected(response, 403);
	});

	it('allows any customer only when the wildcard is explicitly configured', async () => {
		process.env.M2M_CLIENT_CUSTOMER_MAP = JSON.stringify({ [CLIENT_A]: '*' });
		const { response } = await run(CUSTOMER_2);
		expect(response.status).not.toHaveBeenCalled();
		expect(setCustomerEntity).toHaveBeenCalledWith(CUSTOMER_2, response);
	});

	it('keeps clients isolated from each other', async () => {
		process.env.M2M_CLIENT_CUSTOMER_MAP = JSON.stringify({ [CLIENT_A]: [CUSTOMER_1], [CLIENT_B]: [CUSTOMER_2] });
		const { response } = await run(CUSTOMER_2);
		expectRejected(response, 403);
	});
});
