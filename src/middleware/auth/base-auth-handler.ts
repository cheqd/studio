import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { IncomingHttpHeaders } from 'http';
import type { IOAuthProvider } from './oauth/base.js';
import { LogToProvider } from './oauth/logto-provider.js';
import { SwaggerUserInfoFetcher } from './user-info-fetcher/swagger-ui.js';
import { APITokenUserInfoFetcher } from './user-info-fetcher/api-token.js';
import type { IUserInfoFetcher } from './user-info-fetcher/base.js';
import { IAuthHandler, RuleRoutine, IAPIGuard } from './routine.js';
import type { IAuthResponse, MethodToScopeRule } from '../../types/authentication.js';
import { M2MTokenUserInfoFetcher } from './user-info-fetcher/m2m-token.js';

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
				StatusCodes.INTERNAL_SERVER_ERROR,
				`Internal error. There is no auth rule for such request. Please contact administrator`
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
	private bearerTokenIdentifier = 'Bearer';
	private pathSkip = ['/swagger', '/static', '/logto', '/account/bootstrap'];

	constructor() {
		super();
		this.userInfoFetcher = new SwaggerUserInfoFetcher();
		// For now we use only one provider - LogTo
		this.oauthProvider = new LogToProvider();
		this.nextHandler = {} as IAuthHandler;
	}

	public extractBearerTokenFromHeaders({ authorization }: IncomingHttpHeaders): string | unknown {
		if (authorization && authorization.startsWith(this.bearerTokenIdentifier)) {
			return authorization.slice(this.bearerTokenIdentifier.length + 1);
		}
		return undefined;
	}

	private chooseUserFetcherStrategy(request: Request): void {
		const token = this.extractBearerTokenFromHeaders(request.headers) as string;
		const userId = request.headers.userId;
		if (token && userId && typeof userId === 'string') {
			this.setUserInfoStrategy(new M2MTokenUserInfoFetcher(token));
			this.setUserId(userId);
		} else if (token) {
			this.setUserInfoStrategy(new APITokenUserInfoFetcher(token));
		} else {
			this.setUserInfoStrategy(new SwaggerUserInfoFetcher());
		}
	}

	public setOAuthProvider(oauthProvider: IOAuthProvider): void {
		this.oauthProvider = oauthProvider;
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
