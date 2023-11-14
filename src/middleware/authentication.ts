import { Request, Response, NextFunction, response } from 'express';
import { StatusCodes } from 'http-status-codes';

import * as dotenv from 'dotenv';
import { AccountAuthHandler } from './auth/routes/account-auth.js';
import { CredentialAuthHandler } from './auth/routes/credential-auth.js';
import { DidAuthHandler } from './auth/routes/did-auth.js';
import { KeyAuthHandler } from './auth/routes/key-auth.js';
import { CredentialStatusAuthHandler } from './auth/routes/credential-status-auth.js';
import { ResourceAuthHandler } from './auth/routes/resource-auth.js';
import type { BaseAuthHandler } from './auth/base-auth-handler.js';
import { LogToHelper } from './auth/logto-helper.js';
import { PresentationAuthHandler } from './auth/routes/presentation-auth.js';
import { UserService } from '../services/user.js';
import { configLogToExpress } from '../types/constants.js';
import { handleAuthRoutes, withLogto } from '@logto/express';
import { LogToProvider } from './auth/oauth/logto-provider.js';
import { AuthInfoHandler } from './auth/routes/auth-user-info.js';

dotenv.config();

const { ENABLE_EXTERNAL_DB } = process.env;

export class Authentication {
	private authHandler: BaseAuthHandler;
	private isSetup = false;
	private logToHelper: LogToHelper;

	constructor() {
		// Initial auth handler
		this.authHandler = new AccountAuthHandler();
		this.logToHelper = new LogToHelper();
	}

	public async setup(next: NextFunction) {
		if (!this.isSetup) {
			const _r = await this.logToHelper.setup();
			if (_r.status !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
                    error: _r.error,
                });
			}
			const oauthProvider = new LogToProvider();
			oauthProvider.setHelper(this.logToHelper);

			const didAuthHandler = new DidAuthHandler();
			const keyAuthHandler = new KeyAuthHandler();
			const credentialAuthHandler = new CredentialAuthHandler();
			const credentialStatusAuthHandler = new CredentialStatusAuthHandler();
			const resourceAuthHandler = new ResourceAuthHandler();
			const presentationAuthHandler = new PresentationAuthHandler();
			const authInfoHandler = new AuthInfoHandler();

			// Set logToHelper. We do it for avoiding re-asking LogToHelper.setup() in each auth handler
			// cause it does a lot of requests to LogTo
			this.authHandler.setOAuthProvider(oauthProvider);
			didAuthHandler.setOAuthProvider(oauthProvider);
			keyAuthHandler.setOAuthProvider(oauthProvider);
			credentialAuthHandler.setOAuthProvider(oauthProvider);
			credentialStatusAuthHandler.setOAuthProvider(oauthProvider);
			resourceAuthHandler.setOAuthProvider(oauthProvider);
			presentationAuthHandler.setOAuthProvider(oauthProvider);
			authInfoHandler.setOAuthProvider(oauthProvider);

			// Set chain of responsibility
			this.authHandler
				.setNext(didAuthHandler)
				.setNext(keyAuthHandler)
				.setNext(credentialAuthHandler)
				.setNext(credentialStatusAuthHandler)
				.setNext(resourceAuthHandler)
				.setNext(presentationAuthHandler)
				.setNext(authInfoHandler);

			this.isSetup = true;
		}
		return next();
	}

	public async handleError(error: Error, request: Request, response: Response, next: NextFunction) {
		if (error) {
			return response.status(StatusCodes.UNAUTHORIZED).send({
				error: `${error.message}`,
			});
		}
		return next();
	}

	public async accessControl(request: Request, response: Response, next: NextFunction) {
		if (this.authHandler.skipPath(request.path)) return next();

		if (ENABLE_EXTERNAL_DB === 'false') {
			if (['/account', '/did/create', '/key/create'].includes(request.path)) {
				return response.status(StatusCodes.METHOD_NOT_ALLOWED).json({
					error: 'Api not supported',
				});
			}
		}
		next();
	}

	public async wrapperHandleAuthRoutes(request: Request, response: Response, next: NextFunction) {
		const resources = await this.logToHelper.getAllResourcesWithNames()
        return handleAuthRoutes(
            {...configLogToExpress, 
            scopes: ["roles"],
            resources: resources as string[]})(request, response, next)
    }

	public async withLogtoWrapper(request: Request, response: Response, next: NextFunction) {
		if (this.authHandler.skipPath(request.path)) 
            return next()
        try {
            return withLogto({...configLogToExpress, scopes: ["roles"]})(request, response, next)
		} catch (err) {
			return response.status(500).send({
                authenticated: false,
                error: `${err}`,
                customerId: null,
            })
		}
    }

	public async guard(request: Request, response: Response, next: NextFunction) {
		const { provider } = request.body as { claim: string; provider: string };
		if (this.authHandler.skipPath(request.path)) return next();

		try {
			// If response got back that means error was raised
			const _resp = await this.authHandler.handle(request, response);
			if (_resp.status !== StatusCodes.OK) {
				return response.status(_resp.status).json({
					error: _resp.error,
				});
			}
			// Only for rules when it's not allowed for unauthorized users
			// we need to find customer and assign it to the response.locals
			if (!_resp.data.isAllowedUnauthorized) {
				const user = await UserService.instance.get(_resp.data.userId);
				if (!user) {
					return response.status(StatusCodes.NOT_FOUND).json({
						error: `Looks like user with logToId ${_resp.data.userId} is not found`,
					});
				}
				if (user && !user.customer) {
					return response.status(StatusCodes.NOT_FOUND).json({
						error: `Looks like user with logToId ${_resp.data.userId} is not assigned to any CredentialService customer`,
					});
				}
				response.locals.customer = user.customer;
				response.locals.user = user;
			}
			next();
		} catch (err) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
				authenticated: false,
				error: `${err}`,
				customerId: null,
				provider,
			});
		}
	}
}
