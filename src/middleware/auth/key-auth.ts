import type { Request, Response } from 'express';
import { AbstractAuthHandler } from './base-auth.js';
import type { IAuthResponse } from '../../types/authentication.js';

export class KeyAuthHandler extends AbstractAuthHandler {
	constructor() {
		super();
		this.registerRoute('/key/create', 'POST', 'create:key', { skipNamespace: true });
		this.registerRoute('/key/read/(.*)', 'GET', 'read:key', { skipNamespace: true });
		this.registerRoute('/key/list', 'GET', 'list:key', { skipNamespace: true });
	}

	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/key/')) {
			return super.handle(request, response);
		}
		return this.commonPermissionCheck(request);
	}
}
