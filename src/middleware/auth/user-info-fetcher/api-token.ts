import type { Request } from 'express';
import { AuthReturn } from '../routine.js';
import type { IAuthResponse } from '../../../types/authentication.js';
import { StatusCodes } from 'http-status-codes';
import type { IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';

import * as dotenv from 'dotenv';
import { APIKeyService } from '../../../services/admin/api-key.js';
import { UserService } from '../../../services/api/user.js';
dotenv.config();

export class APITokenUserInfoFetcher extends AuthReturn implements IUserInfoFetcher {
	token: string;

	constructor(token: string) {
		super();
		this.token = token;
	}

	async fetchUserInfo(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		return this.verifyToken(this.token as string, oauthProvider);
	}

	public async verifyToken(token: string, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		try {
			const apiEntity = await APIKeyService.instance.get(token);
			if (!apiEntity) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: API Key not found.`);
			}
			if (apiEntity.revoked) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: API Key is revoked.`);
			}
			const userEntity = await UserService.instance.findOne({ customer: apiEntity.customer });
			if (!userEntity) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: User not found.`);
			}
			const _resp = await oauthProvider.getUserScopes(userEntity.logToId as string);
			if (_resp.status !== 200) {
				return this.returnError(StatusCodes.UNAUTHORIZED, `Unauthorized error: No scopes found for the user.`);
			}
			if (_resp.data) {
				this.setScopes(_resp.data);
			}
			this.setCustomerId(apiEntity.customer.customerId);
			return this.returnOk();
		} catch (error) {
			return this.returnError(StatusCodes.INTERNAL_SERVER_ERROR, `Unexpected error: ${error}`);
		}
	}
}
