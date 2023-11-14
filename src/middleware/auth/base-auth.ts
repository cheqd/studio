import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import stringify from 'json-stringify-safe';
import { DefaultNetworkPattern } from '../../types/shared.js';
import { MethodToScope, IAuthResourceHandler, Namespaces, IAuthResponse } from '../../types/authentication.js';
import { LogToHelper } from './logto.js';
import InvalidTokenError from 'jwt-decode';
import jwt_decode from 'jwt-decode';

dotenv.config();

export abstract class AbstractAuthHandler implements IAuthResourceHandler {
	private nextHandler: IAuthResourceHandler;
	private namespace: Namespaces;
	private isAllowedUnauthorized: boolean;
	private token: string;
	private scopes: string[];
	private logToHelper: LogToHelper;

	public logToId: string;

	private routeToScoupe: MethodToScope[] = [];
	private static pathSkip = ['/swagger', '/static', '/logto', '/account/bootstrap', '/auth/user-info'];

	constructor() {
		this.nextHandler = {} as IAuthResourceHandler;
		this.namespace = '' as Namespaces;
		this.token = '' as string;
		this.isAllowedUnauthorized = false;
		this.scopes = [];
		this.logToId = '' as string;
		this.logToHelper = new LogToHelper();
	}

	private reset() {
		this.namespace = '' as Namespaces;
		this.token = '' as string;
		this.scopes = [];
		this.logToId = '' as string;
		this.isAllowedUnauthorized = false;
	}

	public async commonPermissionCheck(request: Request): Promise<IAuthResponse> {
		// Reset all variables
		this.reset();

		// Setup the namespace
		// Here we just trying to get the network value from the request
		// The validation depends on the rule for the request
		const namespace = this.getNamespaceFromRequest(request);
		if (namespace) {
			this.namespace = namespace;
		}

		// Firstly - try to find the rule for the request
		const rule = this.findRule(request.path, request.method, this.getNamespace());

		if (!rule) {
			return this.returnError(
				StatusCodes.INTERNAL_SERVER_ERROR,
				`Internal error: Issue with finding the rule for the path ${request.path}`
			);
		}

		// If the rule is found and it allows unauthorized - return ok
		this.isAllowedUnauthorized = rule.isAllowedUnauthorized();

		if (rule.isAllowedUnauthorized()) {
			return this.returnOk();
		}
		// Namespace should be testnet or mainnet or '' if isSkipNamespace is true
		// Otherwise - raise an error.
		if (!this.namespace && !rule?.isSkipNamespace()) {
			return this.returnError(
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Seems like there is no information about the network in the request.'
			);
		}
		// If the user is not authenticated - return error
		if (!request.user.isAuthenticated) {
			return this.returnError(
				StatusCodes.UNAUTHORIZED,
				"Unauthorized error: Seems like you are not authenticated. Please follow the authentication process using 'LogIn' button"
			);
		}
		// Tries to get customerId from the logTo user structure
		if (request.user && request.user.claims) {
			this.logToId = request.user.claims.sub;
		} else {
			return this.returnError(
				StatusCodes.BAD_GATEWAY,
				'Internal error: Seems like authentication process was corrupted and there are problems with getting customerId'
			);
		}
		// Tries to get scopes for current user and check that required scopes are present
		const _resp = await this.logToHelper.getUserScopes(this.getLogToId());
		if (_resp.status !== 200) {
			return _resp;
		}
		if (_resp.data) {
			this.scopes = _resp.data;
		}
		// Checks if the list of scopes from user enough to make an action
		if (!this.areValidScopes(rule, this.getScopes())) {
			return this.returnError(
				StatusCodes.FORBIDDEN,
				`Unauthorized error: Your account is not authorized to carry out this action.`
			);
		}
		return this.returnOk();
	}

	private returnOk(): IAuthResponse {
		return {
			status: StatusCodes.OK,
			error: '',
			data: {
				logToId: this.getLogToId(),
				scopes: this.getScopes() as string[],
				namespace: this.getNamespace(),
				isAllowedUnauthorized: this.getIsAllowedUnauthorized(),
			},
		};
	}

	private returnError(status: number, error: string): IAuthResponse {
		return {
			status: status,
			error: error,
			data: {
				logToId: '',
				scopes: [],
				namespace: this.getNamespace(),
				isAllowedUnauthorized: this.getIsAllowedUnauthorized(),
			},
		};
	}

	// interface implementation
	public setNext(handler: IAuthResourceHandler): IAuthResourceHandler {
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
		for (const ps of AbstractAuthHandler.pathSkip) {
			if (path === '/' || path.startsWith(ps)) {
				return true;
			}
		}
		return false;
	}

	// common utils
	public setLogToHelper(logToHelper: LogToHelper) {
		this.logToHelper = logToHelper;
	}

	private findNetworkInBody(body: string): string | null {
		const matches = body.match(DefaultNetworkPattern);
		if (matches && matches.length > 0) {
			return matches[1];
		}
		return null;
	}

	private switchNetwork(network: string): Namespaces | null {
		switch (network) {
			case 'testnet': {
				return Namespaces.Testnet;
			}
			case 'mainnet': {
				return Namespaces.Mainnet;
			}
			default: {
				return null;
			}
		}
	}

	public getNamespaceFromRequest(req: Request): Namespaces | null {
		let network: string | null = '';

		if (req && req.body && req.body.credential) {
			const { credential } = req.body;
			let decoded = '';
			let issuerDid = '';
			// Try to get issuer DID
			if (credential && credential.issuer) {
				issuerDid = credential.issuer.id;
			}
			network = this.findNetworkInBody(issuerDid);
			if (network) {
				return this.switchNetwork(network);
			}
			try {
				decoded = jwt_decode(req.body.credential);
			} catch (e) {
				// If it's not a JWT - just skip it
				if (!(e instanceof InvalidTokenError)) {
					throw e;
				}
			}
			// if not - try to search for decoded credential
			network = this.findNetworkInBody(stringify(decoded));
			if (network) {
				return this.switchNetwork(network);
			}
		}
		// Try to search in request body
		if (req && req.body) {
			network = this.findNetworkInBody(stringify(req.body));
			if (network) {
				return this.switchNetwork(network);
			}
		}
		// Try to search in request path
		if (req && req.path) {
			network = this.findNetworkInBody(decodeURIComponent(req.path));
			if (network) {
				return this.switchNetwork(network);
			}
		}
		// For DID create we specify it as a separate parameter in body
		if (req.body && req.body.network) {
			return this.switchNetwork(req.body.network);
		}

		return null;
	}

	// Getters
	public getNamespace(): Namespaces {
		return this.namespace;
	}

	public getToken(): string {
		return this.token;
	}

	public getScopes(): string[] {
		return this.scopes;
	}

	public getLogToId(): string {
		return this.logToId;
	}

	public getIsAllowedUnauthorized(): boolean {
		return this.isAllowedUnauthorized;
	}

	public getAllLogToScopes(): string[] | void {
		if (this.logToHelper) {
			return this.logToHelper.getAllScopes();
		}
	}

	public getDefaultLogToScopes(): string[] | void {
		if (this.logToHelper) {
			return this.logToHelper.getDefaultScopes();
		}
	}

	public getAllLogToResources(): string[] | void {
		if (this.logToHelper) {
			return this.logToHelper.getAllResourcesWithNames();
		}
	}

	// Route and scope related funcs
	public registerRoute(route: string, method: string, scope: string, options = {}): void {
		this.routeToScoupe.push(new MethodToScope(route, method, scope, options));
	}

	public findRule(route: string, method: string, namespace = Namespaces.Testnet): MethodToScope | null {
		for (const rule of this.routeToScoupe) {
			if (rule.doesRuleMatches(route, method, namespace)) {
				return rule;
			}
		}
		return null;
	}

	public isValidScope(rule: MethodToScope, scope: string): boolean {
		return rule.validate(scope);
	}

	public areValidScopes(rule: MethodToScope, scopes: string[]): boolean {
		for (const scope of scopes) {
			if (this.isValidScope(rule, scope)) {
				return true;
			}
		}
		return false;
	}
}
