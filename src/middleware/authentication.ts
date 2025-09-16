import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

import * as dotenv from 'dotenv';
import { AccountAuthProvider } from './auth/routes/api/account-auth.js';
import { KeyAuthProvider } from './auth/routes/api/key-auth.js';
import { LogToHelper } from './auth/logto-helper.js';
import { configLogToExpress } from '../types/constants.js';
import { handleAuthRoutes, withLogto } from '@logto/express';
import { LogToProvider } from './auth/oauth/logto-provider.js';
import { AdminAuthRuleProvider } from './auth/routes/admin/admin-auth.js';
import { APIGuard } from './auth/auth-gaurd.js';
import { AuthRuleRepository } from './auth/routes/auth-rule-repository.js';
import type { IOAuthProvider } from './auth/oauth/abstract.js';
import { DidAuthRuleProvider } from './auth/routes/api/did-auth.js';
import { PresentationAuthRuleProvider } from './auth/routes/api/presentation-auth.js';
import { ResourceAuthRuleProvider } from './auth/routes/api/resource-auth.js';
import { CredentialAuthRuleProvider } from './auth/routes/api/credential-auth.js';
import { CredentialStatusAuthRuleProvider } from './auth/routes/api/credential-status-auth.js';
import { AuthInfoProvider } from './auth/routes/api/auth-user-info.js';
import type { UnsuccessfulResponseBody } from '../types/shared.js';
import { AccreditationAuthRuleProvider } from './auth/routes/api/accreditation-auth.js';
import { EventAuthRuleProvider } from './auth/routes/api/event-auth.js';
import { ProvidersAuthRuleProvider } from './auth/routes/api/provider-auth.js';

dotenv.config();

const { ENABLE_EXTERNAL_DB } = process.env;

export class Authentication {
	private apiGuardian: APIGuard;
	private isSetup = false;
	private logToHelper: LogToHelper;
	private oauthProvider: IOAuthProvider;

	constructor() {
		this.oauthProvider = new LogToProvider();
		const authRuleRepository = new AuthRuleRepository();

		authRuleRepository.push(new AuthInfoProvider());

		authRuleRepository.push(new AccountAuthProvider());
		authRuleRepository.push(new KeyAuthProvider());

		authRuleRepository.push(new DidAuthRuleProvider());
		authRuleRepository.push(new ResourceAuthRuleProvider());
		authRuleRepository.push(new CredentialAuthRuleProvider());
		authRuleRepository.push(new CredentialStatusAuthRuleProvider());
		authRuleRepository.push(new PresentationAuthRuleProvider());
		authRuleRepository.push(new AccreditationAuthRuleProvider());
		authRuleRepository.push(new EventAuthRuleProvider());

		authRuleRepository.push(new AdminAuthRuleProvider());
		authRuleRepository.push(new ProvidersAuthRuleProvider());

		this.apiGuardian = new APIGuard(authRuleRepository, this.oauthProvider);
		// Initial auth handler
		this.logToHelper = new LogToHelper();
	}

	public async setup(response: Response, next: NextFunction) {
		if (!this.isSetup) {
			const _r = await this.logToHelper.setup();
			if (_r.status !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).send({
					error: _r.error,
				});
			}

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
		if (this.apiGuardian.skipPath(request.path)) return next();

		// ToDo: Make it more readable
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
		const resources = this.logToHelper.getAllResourcesWithNames();
		return handleAuthRoutes({ ...configLogToExpress, scopes: ['roles'], resources: resources as string[] })(
			request,
			response,
			next
		);
	}

	public async withLogtoWrapper(request: Request, response: Response, next: NextFunction) {
		if (this.apiGuardian.skipPath(request.path)) return next();
		try {
			return withLogto({ ...configLogToExpress, scopes: ['roles'] })(request, response, next);
		} catch (err) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
				authenticated: false,
				error: `${err}`,
				customerId: null,
			});
		}
	}

	// ToDo: refactor it or keep for the moment of setting up the admin panel
	// private isBootstrapping(request: Request) {
	// 	return ['/account/create'].includes(request.path);
	// }

	public async guard(request: Request, response: Response, next: NextFunction) {
		if (this.apiGuardian.skipPath(request.path)) return next();

		try {
			return await this.apiGuardian.guard(request, response, next);
		} catch (err) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
				error: `Unexpected error: While guarding API request ${err}`,
			} satisfies UnsuccessfulResponseBody);
		}
	}
}
