import type { Request, Response } from 'express';
import { BaseAuthHandler } from '../../base-auth-handler.js';
import type { IAuthResponse } from '../../../../types/authentication.js';

export class AdminHandler extends BaseAuthHandler {
	constructor() {
		super();
		// ToDo: define how to get namespace information
		this.registerRoute('/admin/checkout/session/create', 'POST', 'admin:checkout:session:create:testnet', { skipNamespace: true});
        this.registerRoute('/admin/checkout/session/create', 'POST', 'admin:checkout:session:create:mainnet', { skipNamespace: true});
	}
	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/admin/')) {
			return super.handle(request, response);
		}
		return this.guardAPI(request);
	}
}
