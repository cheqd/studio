import type { Request } from 'express';
import { AuthReturn } from '../routine.js';
import type { IAuthResponse } from '../../../types/authentication.js';
import { StatusCodes } from 'http-status-codes';
import type { IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import * as dotenv from 'dotenv';
dotenv.config();

export class IdTokenUserInfoFetcher extends AuthReturn implements IUserInfoFetcher {
	token: string;

	constructor(token: string) {
		super();
		this.token = token;
	}

	async fetchUserInfo(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		return this.verifyJWTToken(this.token as string, oauthProvider);
	}

	public async verifyJWTToken(token: string, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		try {
			const { payload } = await jwtVerify(
				token, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(oauthProvider.endpoint_jwks)), // generate a jwks using jwks_uri inquired from Logto server
				{
					// expected issuer of the token, should be issued by the Logto server
					issuer: oauthProvider.endpoint_issuer,
					// expected audience token, should be the resource indicator of the current API
					audience: process.env.LOGTO_APP_ID,
				}
			);
			// Setup the scopes from the token
			if (!payload.roles) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: No roles found in the token.`);
			}
			const scopes = await oauthProvider.getScopesForRoles(payload.roles as string[]);
			if (!scopes) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: No scopes found for the roles.`);
			}
			this.setScopes(scopes);
			this.setUserId(payload.sub as string);
			return this.returnOk();
		} catch (error) {
			return this.returnError(StatusCodes.INTERNAL_SERVER_ERROR, `Unexpected error: ${error}`);
		}
	}
}
