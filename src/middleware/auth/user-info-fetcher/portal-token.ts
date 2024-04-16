import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import * as dotenv from 'dotenv';
import type { UnsuccessfulResponseBody } from '../../../types/shared.js';
dotenv.config();

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

		return this.verifyM2MToken(request, response);
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
			// Setup the scopes from the token
			if (!payload.sub) {
				return response.status(StatusCodes.UNAUTHORIZED).json({ 
					error: `Unauthorized error: No sub found in the token. Cannot set customerId.`
				} satisfies UnsuccessfulResponseBody);
			}
			return await this.setUserEntity(payload.sub, response);
		} catch (error) {
			console.error(error);
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
				error:`Unexpected error: While verifying ID token for Portal: ${error}`
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
					error: `Unauthorized error: No sub found in the token.`
				} satisfies UnsuccessfulResponseBody);
			}
			const scopes = payload.scope ? (payload.scope as string).split(' ') : [];
			this.setScopes(scopes, response);
			return;
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
				error: `Unexpected error: While verifying M2M token for Portal: ${error}`
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
