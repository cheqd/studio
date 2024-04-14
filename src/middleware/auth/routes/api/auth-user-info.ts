import type { Request, Response } from 'express';
import { BaseAuthHandler } from '../../base-auth-handler.js';
import type { IAuthResponse } from '../../../../types/authentication.js';

export class AuthInfoHandler extends BaseAuthHandler {
	constructor() {
		super();
		this.registerRoute('/auth/user-info', 'GET', '', { skipNamespace: true, allowUnauthorized: true });
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/auth/user-info')) {
			return super.handle(request, response);
		}
		return this.guardAPI(request);
	}
}
