import type { Request, Response } from 'express';
import { AbstractAuthHandler } from './base-auth.js';
import type { IAuthResponse } from '../../types/authentication.js';

export class AccountAuthHandler extends AbstractAuthHandler {
	constructor() {
		super();
		this.registerRoute('/account', 'GET', 'read:account', { skipNamespace: true });
		this.registerRoute('/account', 'POST', 'create:account', { skipNamespace: true });
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/account')) {
			return super.handle(request, response);
		}
		return this.commonPermissionCheck(request);
	}
}
