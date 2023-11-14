import type { Request } from 'express';
import { AuthReturn } from '../routine.js';
import type { IOAuthProvider } from '../oauth/base.js';
import type { IAuthResponse } from '../../../types/authentication.js';
import { StatusCodes } from 'http-status-codes';
import type { IUserInfoFetcher } from './base.js';

export class SwaggerUserInfoFetcher extends AuthReturn implements IUserInfoFetcher {
	async fetchUserInfo(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		// If the user is not authenticated - return error
		if (!request.user.isAuthenticated) {
			return this.returnError(
				StatusCodes.UNAUTHORIZED,
				"Unauthorized error: Seems like you are not authenticated. Please follow the authentication process using 'LogIn' button"
			);
		}
		// Tries to get customerId from the logTo user structure
		if (request.user && request.user.claims) {
			this.setUserId(request.user.claims.sub);
		} else {
			return this.returnError(
				StatusCodes.BAD_GATEWAY,
				'Internal error: Seems like authentication process was corrupted and there are problems with getting customerId'
			);
		}
		// Tries to get scopes for current user and check that required scopes are present
		const _resp = await oauthProvider.getUserScopes(this.getUserId());
		if (_resp.status !== 200) {
			return _resp;
		}
		if (_resp.data) {
			this.setScopes(_resp.data);
		}
		return this.returnOk();
	}
}
