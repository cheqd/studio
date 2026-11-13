import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { audienceMatches, portalAppIds } from '../id-token-audiences.js';
import { isStaffScope, USER_SESSION_AUTH_METHOD } from '../../../controllers/admin/staff-policy.js';

import * as dotenv from 'dotenv';
import type { UnsuccessfulResponseBody } from '../../../types/shared.js';
dotenv.config();

let warnedAudienceNotEnforced = false;

/** For tests: log the 'not enforced' warning again. */
export function resetPortalAudienceWarningForTests(): void {
	warnedAudienceNotEnforced = false;
}

export class PortalUserInfoFetcher extends UserInfoHelper implements IUserInfoFetcher {
	private m2mToken: string;
	private idToken;
	private oauthProvider: IOAuthProvider;

	constructor(m2mToken: string, idToken: string, oauthProvider: IOAuthProvider) {
		super();
		this.m2mToken = m2mToken;
		this.idToken = idToken;
		this.oauthProvider = oauthProvider;
	}

	async fetch(request: Request, response: Response) {
		// Check the idToken, provided in header
		const errorResponse = await this.verifyIdToken(request, response);
		if (errorResponse) {
			return errorResponse;
		}

		const m2mError = await this.verifyM2MToken(request, response);
		if (m2mError) {
			return m2mError;
		}
		// Both tokens verified: this is a named person's portal session. Only this fetcher sets the marker, and the
		// staff policy refuses any request without it.
		if (response.locals.staffIdentity) {
			response.locals.staffIdentity.authMethod = USER_SESSION_AUTH_METHOD;
		}
		return;
	}

	/**
	 * Verifies the ID token for the portal.
	 *
	 * @param {Request} request - The request object.
	 * @param {Response} response - The response object.
	 * @return {Promise<void>} The result of verifying the ID token.
	 */
	public async verifyIdToken(request: Request, response: Response) {
		try {
			const { payload } = await jwtVerify(
				this.idToken, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(this.oauthProvider.endpoint_jwks)), // generate a jwks using jwks_uri inquired from Logto server
				{
					// expected issuer of the token, should be issued by the Logto server
					issuer: this.oauthProvider.endpoint_issuer,
				}
			);
			// The ID token must have been issued to the portal's application, not to any application in the tenant
			const allowedAudiences = portalAppIds();
			if (allowedAudiences.length > 0) {
				if (!audienceMatches(payload.aud, allowedAudiences)) {
					return response.status(StatusCodes.UNAUTHORIZED).json({
						error: `Unauthorized error: The token was not issued for the portal application.`,
					} satisfies UnsuccessfulResponseBody);
				}
			} else if (!warnedAudienceNotEnforced) {
				warnedAudienceNotEnforced = true;
				console.warn('PORTAL_APP_IDS is not set: the portal ID token audience is not enforced');
			}
			// Setup the scopes from the token
			if (!payload.sub) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No sub found in the token. Cannot set customerId.`,
				} satisfies UnsuccessfulResponseBody);
			}
			// add user scopes
			const _resp = await this.oauthProvider.getUserScopes(payload.sub);
			if (_resp.status !== 200) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No scopes found for the user: ${payload.sub}`,
				} satisfies UnsuccessfulResponseBody);
			}
			// Set global context
			this.setScopes(_resp.data, response);
			await this.setStaffIdentity(payload, response);
			this.setAuthTime(payload.auth_time, response);
			return await this.setUserEntity(payload.sub, response);
		} catch (error) {
			console.error(error);
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying ID token for Portal: ${error}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}

	public async verifyM2MToken(request: Request, response: Response) {
		try {
			const { payload } = await jwtVerify(
				this.m2mToken, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(this.oauthProvider.endpoint_jwks)), // generate a jwks using jwks_uri inquired from Logto server
				{
					// expected issuer of the token, should be issued by the Logto server
					issuer: this.oauthProvider.endpoint_issuer,
				}
			);
			// Setup the scopes from the token
			if (!payload.sub) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No sub found in the token.`,
				} satisfies UnsuccessfulResponseBody);
			}
			// The M2M client acts for the portal, not for the person: it must never add a staff scope to the user's
			// own scopes (F-29). Customer-facing scopes are kept as before.
			const scopes = (payload.scope ? (payload.scope as string).split(' ') : []).filter(
				(scope) => !isStaffScope(scope)
			);
			this.appendScopes(scopes, response);
			return;
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying M2M token for Portal: ${error}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}

	/**
	 * Records who the verified ID token says the user is, for the staff policy. Email and its verification come from
	 * the verified token claims only (the portal asks for the Logto `email` scope). Role names come from Logto's
	 * Management API, so removing a role applies without waiting for the token to expire; the token's `roles` claim
	 * is used only when that lookup fails. Nothing is read from a header, and nothing is logged here.
	 */
	private async setStaffIdentity(payload: JWTPayload, response: Response) {
		let roles: string[] | undefined;
		try {
			const lookup = await this.oauthProvider.getUserRoles(payload.sub as string);
			if (lookup.status === StatusCodes.OK && Array.isArray(lookup.data)) {
				roles = lookup.data as string[];
			}
		} catch {
			roles = undefined;
		}
		if (!roles && Array.isArray(payload.roles) && payload.roles.every((role) => typeof role === 'string')) {
			roles = payload.roles as string[];
		}
		response.locals.staffIdentity = {
			logtoUserId: payload.sub,
			email: typeof payload.email === 'string' ? payload.email : undefined,
			emailVerified: typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
			roles,
			authMethod: undefined,
		};
	}
}
