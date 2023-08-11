import type { Request, Response } from 'express';
import { AbstractAuthHandler } from './base-auth.js';
import type { IAuthResponse } from '../../types/authentication.js';

export class DidAuthHandler extends AbstractAuthHandler {
	constructor() {
		super();
		this.registerRoute('/did/create', 'POST', 'create:did:testnet');
		this.registerRoute('/did/create', 'POST', 'create:did:mainnet');
		this.registerRoute('/did/list', 'GET', 'list:did:testnet');
		this.registerRoute('/did/list', 'GET', 'list:did:mainnet');
		this.registerRoute('/did/update', 'POST', 'update:did:testnet');
		this.registerRoute('/did/update', 'POST', 'update:did:mainnet');
		this.registerRoute('/did/deactivate', 'POST', 'deactivate:did:testnet');
		this.registerRoute('/did/deactivate', 'POST', 'deactivate:did:mainnet');
		// true means allowUnauthorized
		this.registerRoute('/did/(.*)', 'GET', '', { allowUnauthorized: true, skipNamespace: true });
	}

	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (!request.path.includes('/did')) {
			return super.handle(request, response);
		}
		return this.commonPermissionCheck(request);
	}
}
