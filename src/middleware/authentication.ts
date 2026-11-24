import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

import * as dotenv from 'dotenv';
import { LogToHelper } from './auth/logto-helper.js';
import { configLogToExpress } from '../types/constants.js';
import { handleAuthRoutes, withLogto } from '@logto/express';
import { LogToProvider } from './auth/oauth/logto-provider.js';
import { APIGuard } from './auth/auth-gaurd.js';
import { createAuthRuleRepository } from './auth/routes/auth-rules.js';
import type { IOAuthProvider } from './auth/oauth/abstract.js';
import type { UnsuccessfulResponseBody } from '../types/shared.js';

dotenv.config();

const { ENABLE_EXTERNAL_DB } = process.env;

export class Authentication {
	private apiGuardian: APIGuard;
	private isSetup = false;
	private logToHelper: LogToHelper;
	private oauthProvider: IOAuthProvider;

	constructor() {
		this.oauthProvider = new LogToProvider();
		const authRuleRepository = createAuthRuleRepository();

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
