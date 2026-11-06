import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const jwtVerifyMock = jest.fn(async () => {
	throw new Error('not a real JWT -- test double rejects every call');
});

jest.unstable_mockModule('jose', () => ({
	jwtVerify: jwtVerifyMock,
	createRemoteJWKSet: jest.fn(() => ({})),
}));

const { APIGuard } = await import('../../../src/middleware/auth/auth-gaurd.js');
const { AuthRuleRepository } = await import('../../../src/middleware/auth/routes/auth-rule-repository.js');
const { AdminAuthRuleProvider } = await import('../../../src/middleware/auth/routes/admin/admin-auth.js');

describe('APIGuard M2M auth strategy', () => {
	it('verifies the bearer token, not the customer-id header, as the JWT (regression test for #874)', async () => {
		const repository = new AuthRuleRepository();
		repository.push(new AdminAuthRuleProvider());
		const fakeOAuthProvider = {
			endpoint_issuer: 'https://issuer.example/oidc',
			endpoint_jwks: 'https://issuer.example/oidc/jwks',
		} as unknown as ConstructorParameters<typeof APIGuard>[1];
		const guard = new APIGuard(repository, fakeOAuthProvider);

		const request = {
			method: 'DELETE',
			path: '/admin/organisation/delete',
			headers: {
				authorization: 'Bearer the-real-m2m-jwt',
				'customer-id': 'ab12cd34-not-a-jwt',
			},
			user: { isAuthenticated: true },
		} as unknown as Request;
		const response = {
			locals: {},
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		} as unknown as Response;

		await guard.guard(request, response, jest.fn() as never);

		expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
		// The whole point of #874: this must be the bearer token, never the customer-id header value.
		expect(jwtVerifyMock).toHaveBeenCalledWith(
			'the-real-m2m-jwt',
			expect.anything(),
			expect.objectContaining({ issuer: fakeOAuthProvider.endpoint_issuer })
		);
	});
});
