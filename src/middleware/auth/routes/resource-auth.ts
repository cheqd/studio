import type { Request, Response } from 'express';
import { BaseAuthHandler } from '../base-auth-handler.js';
import type { IAuthResponse } from '../../../types/authentication.js';

export class ResourceAuthHandler extends BaseAuthHandler {
	constructor() {
		super();
		this.registerRoute('/resource/create', 'POST', 'create:resource:testnet');
		this.registerRoute('/resource/create', 'POST', 'create:resource:mainnet');
		// Unauthorized routes
		this.registerRoute('/resource/search/(.*)', 'GET', '', { allowUnauthorized: true, skipNamespace: true });
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/resource/')) {
			return super.handle(request, response);
		}
		return this.guardAPI(request);
	}
}
