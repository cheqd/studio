import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';

import * as dotenv from 'dotenv';
import { APIKeyService } from '../../../services/admin/api-key.js';
import { UserService } from '../../../services/api/user.js';
import type { UnsuccessfulResponseBody } from '../../../types/shared.js';
dotenv.config();

export class APITokenUserInfoFetcher extends UserInfoHelper implements IUserInfoFetcher {
	token: string;
	private oauthProvider: IOAuthProvider;

	constructor(token: string, oauthProvider: IOAuthProvider) {
		super();
		this.token = token;
		this.oauthProvider = oauthProvider;
	}

	async fetch(request: Request, response: Response): Promise<Response | undefined> {
		return this.verifyToken(this.token as string, response);
	}

	public async verifyToken(token: string, response: Response): Promise<Response | undefined> {
		try {
			const apiEntity = await APIKeyService.instance.get(token);
			if (!apiEntity) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: API Key not found.`
				} satisfies UnsuccessfulResponseBody);
			}
			if (apiEntity.revoked) {
				return response.status(StatusCodes.UNAUTHORIZED).json({ 
					error: `Unauthorized error: API Key is revoked.` 
				} satisfies UnsuccessfulResponseBody);
			}
			const userEntity = await UserService.instance.findOne({ customer: apiEntity.customer });
			if (!userEntity) {
				return response.status(StatusCodes.UNAUTHORIZED).json({ 
					error: `Unauthorized error: User not found.`
				} satisfies UnsuccessfulResponseBody);
			}
			const _resp = await this.oauthProvider.getUserScopes(userEntity.logToId as string);
			if (_resp.status !== 200) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No scopes found for the user: ${userEntity.logToId}`
				} satisfies UnsuccessfulResponseBody);
			}
			// Set global context
			this.setScopes(_resp.data, response);
			return await this.setCustomerEntity(apiEntity.customer.customerId, response);

		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying API key: ${error}`
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
