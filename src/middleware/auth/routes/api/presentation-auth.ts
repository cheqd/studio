import type { Request, Response } from 'express';
import { BaseAuthHandler } from '../../base-auth-handler.js';
import type { IAuthResponse } from '../../../../types/authentication.js';

export class PresentationAuthHandler extends BaseAuthHandler {
	constructor() {
		super();
		// Unauthorized routes
		this.registerRoute('/presentation/verify', 'POST', 'verify:presentation', { skipNamespace: true });
		this.registerRoute('/presentation/create', 'POST', 'create:presentation', { skipNamespace: true });
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/presentation/')) {
			return super.handle(request, response);
		}
		return this.guardAPI(request);
	}
}
