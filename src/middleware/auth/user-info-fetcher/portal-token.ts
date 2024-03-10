import type { Request } from 'express';
import { AuthReturn } from '../routine.js';
import type { IAuthResponse } from '../../../types/authentication.js';
import { StatusCodes } from 'http-status-codes';
import type { IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/base.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import * as dotenv from 'dotenv';
dotenv.config();

export class PortalUserInfoFetcher extends AuthReturn implements IUserInfoFetcher {
	private m2mToken: string;
	private idToken;

	constructor(m2mToken: string, idToken: string) {
		super();
		this.m2mToken = m2mToken;
		this.idToken = idToken;
	}

	async fetchUserInfo(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		// Get customerId from header
		if (!this.idToken) {
			return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: No idToken found in the header.`);
		}

		// Check the idToken, provided in header
		const idTokenVerification = await this.verifyIdToken(oauthProvider);
		if (idTokenVerification.error) {
			return idTokenVerification;
		}
		// return this.returnOk();

		return this.verifyM2MToken(oauthProvider);
	}

	public async verifyIdToken(oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		try {
			const { payload } = await jwtVerify(
				this.idToken, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(oauthProvider.endpoint_jwks)), // generate a jwks using jwks_uri inquired from Logto server
				{
					// expected issuer of the token, should be issued by the Logto server
					issuer: oauthProvider.endpoint_issuer,
				}
			);
			// Setup the scopes from the token
			if (!payload.sub) {
				return this.returnError(
					StatusCodes.UNAUTHORIZED,
					`Unauthorized error: No sub found in the token. Cannot set customerId.`
				);
			}
			this.setUserId(payload.sub);
			return this.returnOk();
		} catch (error) {
			console.error(error);
			return this.returnError(StatusCodes.INTERNAL_SERVER_ERROR, `Unexpected error: ${error}`);
		}
	}

	public async verifyM2MToken(oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		try {
			const { payload } = await jwtVerify(
				this.m2mToken, // The raw Bearer Token extracted from the request header
				createRemoteJWKSet(new URL(oauthProvider.endpoint_jwks)), // generate a jwks using jwks_uri inquired from Logto server
				{
					// expected issuer of the token, should be issued by the Logto server
					issuer: oauthProvider.endpoint_issuer,
				}
			);
			// Setup the scopes from the token
			if (!payload.sub) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: No sub found in the token.`);
			}
			const { error, data: scopes } = await oauthProvider.getAppScopes(payload.sub);
			if (error) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: No scopes found for the roles.`);
			}
			this.setScopes(scopes);
			return this.returnOk();
		} catch (error) {
			console.error(error);
			return this.returnError(StatusCodes.INTERNAL_SERVER_ERROR, `Unexpected error: ${error}`);
		}
	}
}
