/**
 * Stub bearer tokens. The hermetic tier replaces `jose` so that `jwtVerify` accepts exactly these tokens and nothing
 * else. A stub token is `stub.<base64url(json claims)>`; anything else is rejected the way a bad signature would be.
 * The claims are still checked for issuer and audience, mirroring the options the production fetchers pass.
 */
export const STUB_ISSUER = 'http://logto.invalid/oidc';
export const STUB_AUDIENCE = 'test-app-id';

export type StubClaims = {
	sub: string;
	iss?: string;
	aud?: string;
	roles?: string[];
	scope?: string;
	expired?: boolean;
	[claim: string]: unknown;
};

export function stubToken(claims: StubClaims): string {
	const body = { iss: STUB_ISSUER, aud: STUB_AUDIENCE, ...claims };
	return `stub.${Buffer.from(JSON.stringify(body)).toString('base64url')}`;
}

export function verifyStubToken(
	token: string,
	options: { issuer?: string; audience?: string | string[] } = {}
): { payload: StubClaims } {
	if (typeof token !== 'string' || !token.startsWith('stub.')) {
		throw new Error('JWSInvalid: Invalid Compact JWS');
	}
	const payload = JSON.parse(Buffer.from(token.slice('stub.'.length), 'base64url').toString('utf8')) as StubClaims;
	if (payload.expired) throw new Error('JWTExpired: "exp" claim timestamp check failed');
	if (options.issuer && payload.iss !== options.issuer) throw new Error('JWTClaimValidationFailed: unexpected "iss"');
	if (options.audience) {
		const allowed = Array.isArray(options.audience) ? options.audience : [options.audience];
		if (!payload.aud || !allowed.includes(payload.aud)) {
			throw new Error('JWTClaimValidationFailed: unexpected "aud"');
		}
	}
	return { payload };
}
