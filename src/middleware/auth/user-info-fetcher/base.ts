import type { Request } from 'express';
import type { IAuthResponse } from '../../../types/authentication.js';
import type { IOAuthProvider } from '../oauth/base.js';

export interface IUserInfoFetcher {
	fetchUserInfo(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse>;
}
