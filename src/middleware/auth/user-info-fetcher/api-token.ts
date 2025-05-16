import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { IOAuthProvider } from '../oauth/abstract.js';

import * as dotenv from 'dotenv';
import { APIKeyService } from '../../../services/admin/api-key.js';
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
		return this.verifyToken(response);
	}

	/**
	 * Verifies the token and sets the user's scopes and customer entity in the global context.
	 *
	 * @param {Response} response - The response object to send the response.
	 * @return {Promise<Response | undefined>} The response object with the appropriate status code and error message, or undefined if successful.
	 */
	public async verifyToken(response: Response): Promise<Response | undefined> {
		try {
			// fetches api, customer and user entity
			const apiEntity = await APIKeyService.instance.get(this.token);
			const userEntity = apiEntity.user;
			const customerEntity = apiEntity.customer;
			if (!apiEntity) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: API Key not found.`,
				} satisfies UnsuccessfulResponseBody);
			}
			if (apiEntity.revoked) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: API Key is revoked.`,
				} satisfies UnsuccessfulResponseBody);
			}
			if (!userEntity || !customerEntity) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: User not found.`,
				} satisfies UnsuccessfulResponseBody);
			}
			const _resp = await this.oauthProvider.getUserScopes(userEntity.logToId as string);
			if (_resp.status !== 200) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No scopes found for the user: ${userEntity.logToId}`,
				} satisfies UnsuccessfulResponseBody);
			}
			// Set global context
			this.setScopes(_resp.data, response);
			response.locals.user = userEntity;
			response.locals.customer = customerEntity;
			return;
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying API key: ${error}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
