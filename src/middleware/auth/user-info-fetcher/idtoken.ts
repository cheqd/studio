import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import * as dotenv from 'dotenv';
import type { UnsuccessfulResponseBody } from '../../../types/shared.js';
dotenv.config();

export class IdTokenUserInfoFetcher extends UserInfoHelper implements IUserInfoFetcher {
	token: string;
	private oauthProvider: IOAuthProvider;

	constructor(token: string, oauthProvider: IOAuthProvider) {
		super();
		this.token = token;
		this.oauthProvider = oauthProvider;
	}

	async fetch(request: Request, response: Response) {
		return this.verifyJWTToken(request, response);
	}

	/**
	 * Verifies the JWT token and sets the user's scopes and customer entity in the global context.
	 *
	 * @param {Request} request - The request object.
	 * @param {Response} response - The response object.
	 * @return {Promise<Response | undefined>} The response object with the appropriate status code and error message, or undefined if successful.
	 */
	public async verifyJWTToken(request: Request, response: Response) {
		try {
			const { payload } = await jwtVerify(
				this.token, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(this.oauthProvider.endpoint_jwks)),
				{
					// expected issuer of the token, should be issued by the Logto server
					issuer: this.oauthProvider.endpoint_issuer,
					// expected audience token, should be the resource indicator of the current API
					audience: process.env.LOGTO_APP_ID,
				}
			);
			// Setup the scopes from the token
			if (!payload.roles) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No roles found in the token.`,
				} satisfies UnsuccessfulResponseBody);
			}
			const scopes = await this.oauthProvider.getScopesForRoles(payload.roles as string[]);
			if (!scopes) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No scopes found for the roles: ${payload.roles}`,
				} satisfies UnsuccessfulResponseBody);
			}
			// Set global context
			this.setScopes(scopes, response);
			return await this.setUserEntity(payload.sub as string, response);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying ID token: ${error}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
