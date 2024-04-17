import type { Response, Request } from 'express';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { StatusCodes } from 'http-status-codes';
import { UserInfoHelper, type IUserInfoFetcher } from './base.js';
import type { UnsuccessfulResponseBody } from '../../../types/shared.js';

export class SwaggerUserInfoFetcher extends UserInfoHelper implements IUserInfoFetcher {
	private oauthProvider: IOAuthProvider;

	constructor(oauthProvider: IOAuthProvider) {
		super();
		this.oauthProvider = oauthProvider;
	}
	/**
	 * Tries to fetch user information based on the request and sets the appropriate response.
	 *
	 * @param {Request} request - The request object containing user information.
	 * @param {Response} response - The response object to be set based on user authentication status.
	 * @return {Promise<Response>} The response object with user information or an error message.
	 */
	async fetch(request: Request, response: Response) {
		try {
			// If the user is not authenticated - return error
			if (!request.user.isAuthenticated) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: "Unauthorized error: Seems like you are not authenticated. Please follow the authentication process using 'LogIn' button",
				} satisfies UnsuccessfulResponseBody);
			}
			// Tries to get customerId from the logTo user structure
			if (!request.user || !request.user.claims || !request.user.claims.sub) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: 'Internal error: Seems like authentication process was corrupted and there are problems with getting customerId',
				} satisfies UnsuccessfulResponseBody);
			}
			const userId = request.user.claims.sub;
			// Tries to get scopes for current user and check that required scopes are present
			const _resp = await this.oauthProvider.getUserScopes(userId);
			if (_resp.status !== 200) {
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `Unauthorized error: No scopes found for the user: ${userId}.`,
				} satisfies UnsuccessfulResponseBody);
			}
			this.setScopes(_resp.data, response);
			return await this.setUserEntity(userId, response);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: While verifying API key: ${error}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
