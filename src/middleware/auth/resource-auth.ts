import type { Request, Response } from 'express';
import { AbstractAuthHandler } from './base-auth.js';
import type { IAuthResponse } from '../../types/authentication.js';

export class ResourceAuthHandler extends AbstractAuthHandler {
	constructor() {
		super();
		this.registerRoute('/resource/create', 'POST', 'create:resource:testnet');
		this.registerRoute('/resource/create', 'POST', 'create:resource:mainnet');
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/resource')) {
			return super.handle(request, response);
		}
		return this.commonPermissionCheck(request);
	}
}
