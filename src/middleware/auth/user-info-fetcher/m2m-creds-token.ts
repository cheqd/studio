import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as dotenv from 'dotenv';
import { authoriseM2MRequest } from '../m2m-client-policy.js';
import type { UnsuccessfulResponseBody } from '../../../types/shared.js';
dotenv.config();

export class M2MCredsTokenUserInfoFetcher extends UserInfoHelper implements IUserInfoFetcher {
	token: string;
	private oauthProvider: IOAuthProvider;

	constructor(token: string, oauthProvider: IOAuthProvider) {
		super();
		this.token = token;
		this.oauthProvider = oauthProvider;
	}

	/**
	 * Verify M2M token
	 *
	 * @param {Request} request - The request object.
	 * @param {Response} response - The response object.
	 * @return {Promise<void>} The result of verifying the M2M token.
	 */
	async fetch(request: Request, response: Response) {
		// Verify M2M token
		return this.verifyJWTToken(request, response);
	}

	public async verifyJWTToken(request: Request, response: Response) {
		// Get customerId from header
		const customerId = request.headers['customer-id'];
		try {
			const { payload } = await jwtVerify(
				this.token, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(this.oauthProvider.endpoint_jwks)),
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
			// The token must be for this API, from an allowed M2M client, acting for a customer bound to that client
			const decision = authoriseM2MRequest(payload, customerId);
			if (!decision.allowed) {
				return response.status(decision.status).json({
					error: decision.error,
				} satisfies UnsuccessfulResponseBody);
			}
			// Set global context
			const scopes = payload.scope ? (payload.scope as string).split(' ') : [];
			this.setScopes(scopes, response);
			return await this.setCustomerEntity(customerId as string, response);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying M2M token: ${error}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
