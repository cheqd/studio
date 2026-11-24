import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const FRESH_SIGNIN_ERROR_CODE = 'REAUTHENTICATION_REQUIRED';
const DEFAULT_MAX_AGE_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 60;

export function getFreshSignInMaxAgeSeconds(): number {
	const parsed = Number.parseInt(process.env.FRESH_SIGNIN_MAX_AGE_SECONDS || '', 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_SECONDS;
}

/**
 * Requires the caller to have authenticated recently. `response.locals.authTime` is the Logto `auth_time` claim
 * (seconds since epoch), set by the id-token fetchers. Fails closed: if there is no auth_time (API keys, M2M
 * credentials, tokens without the claim) the request is rejected with the same distinct error code. This is deliberate
 * (U-63): key export and account deletion can only be called from a portal session, never with an API key.
 *
 * The 401 carries an RFC 9470 `WWW-Authenticate: Bearer error="insufficient_user_authentication"` challenge and a
 * JSON body `{ error, code: "REAUTHENTICATION_REQUIRED", maxAgeSeconds }`.
 */
export function requireFreshSignIn(options: { maxAgeSeconds?: number; now?: () => number } = {}) {
	return (_request: Request, response: Response, next: NextFunction) => {
		const maxAge = options.maxAgeSeconds ?? getFreshSignInMaxAgeSeconds();
		const nowSeconds = (options.now ?? Date.now)() / 1000;
		const authTime = response.locals.authTime;
		const fresh =
			typeof authTime === 'number' &&
			Number.isFinite(authTime) &&
			authTime <= nowSeconds + CLOCK_SKEW_SECONDS &&
			nowSeconds - authTime <= maxAge;
		if (fresh) {
			return next();
		}
		response.setHeader(
			'WWW-Authenticate',
			`Bearer error="insufficient_user_authentication", error_description="A recent sign-in is required", max_age=${maxAge}`
		);
		return response.status(StatusCodes.UNAUTHORIZED).json({
			error: `This action requires a recent portal sign-in (within the last ${maxAge} seconds); API keys and machine credentials cannot call it. Sign in to the portal again and retry.`,
			code: FRESH_SIGNIN_ERROR_CODE,
			maxAgeSeconds: maxAge,
		});
	};
}
