import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { IncomingHttpHeaders } from 'http';
import type { IOAuthProvider } from './oauth/base.js';
import { LogToProvider } from './oauth/logto-provider.js';
import { SwaggerUserInfoFetcher } from './user-info-fetcher/swagger-ui.js';
import { IdTokenUserInfoFetcher } from './user-info-fetcher/idtoken.js';
import type { IUserInfoFetcher } from './user-info-fetcher/base.js';
import { IAuthHandler, RuleRoutine, IAPIGuard } from './routine.js';
import type { IAuthResponse, MethodToScopeRule } from '../../types/authentication.js';
import { M2MCredsTokenUserInfoFetcher } from './user-info-fetcher/m2m-creds-token.js';
import { decodeJwt } from 'jose';
import { PortalUserInfoFetcher } from './user-info-fetcher/portal-token.js';
import { APITokenUserInfoFetcher } from './user-info-fetcher/api-token.js';

export class BaseAPIGuard extends RuleRoutine implements IAPIGuard {
	userInfoFetcher: IUserInfoFetcher = {} as IUserInfoFetcher;

	async guardAPI(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse> {
		// Reset all variables
		this.reset();
		// Preps
		this.preps(request);
		// Firstly - try to find the rule for the request
		const rule = this.findRule(request.path, request.method, this.getNamespace());

		if (!rule) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				`Bad Request. No auth rules for handling such request: ${request.method} ${request.path}`
			);
		}
		// If the rule is not found - skip the auth check
		if (!rule.isEmpty()) {
			this.setRule(rule);
			// If the rule is found and it allows unauthorized - return ok
			this.setIsAllowedUnauthorized(rule.isAllowedUnauthorized());
		}
		// Rule can has allowedUnauthorised to true - it means that it's allowed for all
		// Rule can has empty namespace - it means that it's allowed for all namespaces
		let _res = this.applyDefaults(request);
		if (_res) {
			return _res;
		}
		// Set userId. Usually it will be the LogTo userId
		// Here we could get UserId from API Key or from user's token
		_res = await this.userInfoFetcher.fetchUserInfo(request, oauthProvider);
		if (_res.error) {
			return _res;
		}
		this.setScopes(_res.data.scopes);
		this.setUserId(_res.data.userId);
		this.setCustomerId(_res.data.customerId);
		// Checks if the list of scopes from user enough to make an action
		if (!this.areValidScopes(this.getRule(), this.getScopes())) {
			return this.returnError(
				StatusCodes.FORBIDDEN,
				`Unauthorized error: Your account is not authorized to carry out this action.`
			);
		}
		return this.returnOk();
	}

	protected preps(request: Request) {
		// Setup the namespace
		// Here we just trying to get the network value from the request
		// The validation depends on the rule for the request
		const namespace = this.getNamespaceFromRequest(request);
		if (namespace) {
			this.setNamespace(namespace);
		}
	}

	protected applyDefaults(request: Request): IAuthResponse | void {
		const rule = this.getRule();
		const namespace = this.getNamespace();

		if (rule.isEmpty()) {
			return this.returnError(
				StatusCodes.INTERNAL_SERVER_ERROR,
				`Internal error: Issue with finding the rule for the path ${request.path}`
			);
		}
		// If the rule allows unauthorized - return ok
		if (rule.isAllowedUnauthorized()) {
			return this.returnOk();
		}
		// Namespace should be testnet or mainnet or '' if isSkipNamespace is true
		// Otherwise - raise an error.
		if (!namespace && !rule.isSkipNamespace()) {
			return this.returnError(
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Seems like there is no information about the network in the request.'
			);
		}
	}

	public isValidScope(rule: MethodToScopeRule, scope: string): boolean {
		return rule.validate(scope);
	}

	public areValidScopes(rule: MethodToScopeRule, scopes: string[]): boolean {
		for (const scope of scopes) {
			if (this.isValidScope(rule, scope)) {
				return true;
			}
		}
		return false;
	}
}

export class BaseAuthHandler extends BaseAPIGuard implements IAuthHandler {
	private nextHandler: IAuthHandler;
	oauthProvider: IOAuthProvider;
	private static bearerTokenIdentifier = 'Bearer';
	private pathSkip = ['/swagger', '/static', '/logto', '/account/bootstrap', '/admin/webhook', '/admin/swagger'];

	constructor() {
		super();
		this.userInfoFetcher = new SwaggerUserInfoFetcher();
		// For now we use only one provider - LogTo
		this.oauthProvider = new LogToProvider();
		this.nextHandler = {} as IAuthHandler;
	}

	public static extractBearerTokenFromHeaders({ authorization }: IncomingHttpHeaders): string | unknown {
		if (authorization && authorization.startsWith(this.bearerTokenIdentifier)) {
			return authorization.slice(this.bearerTokenIdentifier.length + 1);
		}
		return undefined;
	}

	private chooseUserFetcherStrategy(request: Request): void {
		const token = BaseAuthHandler.extractBearerTokenFromHeaders(request.headers) as string;
		const apiKey = request.headers['x-api-key'] as string;
		const headerIdToken = request.headers['id-token'] as string;
		if (headerIdToken && token) {
			this.setUserInfoStrategy(new PortalUserInfoFetcher(token, headerIdToken));
			return;
		}

		if (token) {
			const payload = decodeJwt(token);
			if (payload.aud === process.env.LOGTO_APP_ID) {
				this.setUserInfoStrategy(new IdTokenUserInfoFetcher(token));
				return;
			} else {
				this.setUserInfoStrategy(new M2MCredsTokenUserInfoFetcher(token));
				return;
			}
		}
		if (apiKey) {
			this.setUserInfoStrategy(new APITokenUserInfoFetcher(apiKey));
			return;
		} else {
			this.setUserInfoStrategy(new SwaggerUserInfoFetcher());
		}

	}

	public setOAuthProvider(oauthProvider: IOAuthProvider): IAuthHandler {
		this.oauthProvider = oauthProvider;
		return this;
	}

	public setUserInfoStrategy(strategy: IUserInfoFetcher): void {
		this.userInfoFetcher = strategy;
	}

	// interface implementation
	async guardAPI(request: Request): Promise<IAuthResponse> {
		this.chooseUserFetcherStrategy(request);
		return super.guardAPI(request, this.oauthProvider);
	}

	public setNext(handler: IAuthHandler): IAuthHandler {
		this.nextHandler = handler;
		return handler;
	}

	public async handle(request: Request, response: Response): Promise<IAuthResponse> {
		if (Object.keys(this.nextHandler).length !== 0) {
			return this.nextHandler.handle(request, response);
		}
		// If request.path was not registered in the routeToScope, then skip the auth check
		return this.returnOk();
	}

	public skipPath(path: string): boolean {
		for (const ps of this.pathSkip) {
			if (path === '/' || path.startsWith(ps)) {
				return true;
			}
		}
		return false;
	}
}
