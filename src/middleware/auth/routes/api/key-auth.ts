import type { Request, Response } from 'express';
import { BaseAuthHandler } from '../../base-auth-handler.js';
import type { IAuthResponse } from '../../../../types/authentication.js';

export class KeyAuthHandler extends BaseAuthHandler {
	constructor() {
		super();
		this.registerRoute('/key/create', 'POST', 'create:key', { skipNamespace: true });
		this.registerRoute('/key/import', 'POST', 'import:key', { skipNamespace: true });
		this.registerRoute('/key/read/(.*)', 'GET', 'read:key', { skipNamespace: true });
		this.registerRoute('/key/list', 'GET', 'list:key', { skipNamespace: true });
	}

	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/key/')) {
			return super.handle(request, response);
		}
		return this.guardAPI(request);
	}
}
