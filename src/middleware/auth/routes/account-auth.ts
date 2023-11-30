import type { Request, Response } from 'express';
import { BaseAuthHandler } from '../base-auth-handler.js';
import type { IAuthResponse } from '../../../types/authentication.js';

export class AccountAuthHandler extends BaseAuthHandler {
	constructor() {
		super();
		this.registerRoute('/account', 'GET', 'read:account', { skipNamespace: true });
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/account')) {
			return super.handle(request, response);
		}
		return this.guardAPI(request);
	}
}
