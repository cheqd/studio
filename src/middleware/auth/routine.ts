import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import stringify from 'json-stringify-safe';
import { DefaultNetworkPattern } from '../../types/shared.js';
import { MethodToScopeRule, Namespaces, IAuthResponse, ICommonErrorResponse } from '../../types/authentication.js';
import { InvalidTokenError } from 'jwt-decode';
import { jwtDecode } from 'jwt-decode';
import type { IOAuthProvider } from './oauth/base.js';
import type { IUserInfoFetcher } from './user-info-fetcher/base.js';
dotenv.config();

export interface IAPIGuard {
	guardAPI(request: Request, oauthProvider: IOAuthProvider): Promise<IAuthResponse>;
}

export interface IAuthParams {
	reset(): void;
	// Getters
	getUserId(): string;
	getScopes(): string[];
	getNamespace(): Namespaces;
	getIsAllowedUnauthorized(): boolean;
	getRule(): MethodToScopeRule;
	getRouteToScopeList(): MethodToScopeRule[];
	// Setters
	setUserId(userId: string): void;
	setScopes(scopes: string[]): void;
	setNamespace(namespace: Namespaces): void;
	setIsAllowedUnauthorized(isAllowedUnauthorized: boolean): void;
	setRule(MethodToScopeRule: MethodToScopeRule): void;
	pushToRuleList(MethodToScopeRule: MethodToScopeRule): void;
}

export class AuthParams implements IAuthParams {
	userId: string;
	scopes: string[];
	namespace: Namespaces;
	isAllowedUnauthorized: boolean;
	rule: MethodToScopeRule;
	routeToScoupeList: MethodToScopeRule[] = [];

	constructor() {
		this.namespace = '' as Namespaces;
		this.scopes = [];
		this.userId = '' as string;
		this.isAllowedUnauthorized = false;
		this.rule = {} as MethodToScopeRule;
		this.routeToScoupeList = [];
	}

	// Getters
	public getUserId(): string {
		return this.userId;
	}
	public getScopes(): string[] {
		return this.scopes;
	}
	public getNamespace(): Namespaces {
		return this.namespace;
	}
	public getIsAllowedUnauthorized(): boolean {
		return this.isAllowedUnauthorized;
	}
	public getRule(): MethodToScopeRule {
		return this.rule;
	}
	public getRouteToScopeList(): MethodToScopeRule[] {
		return this.routeToScoupeList;
	}

	//Setters
	public setUserId(userId: string): void {
		this.userId = userId;
	}
	public setScopes(scopes: string[]): void {
		this.scopes = scopes;
	}
	public setNamespace(namespace: Namespaces): void {
		this.namespace = namespace;
	}
	public setIsAllowedUnauthorized(isAllowedUnauthorized: boolean): void {
		this.isAllowedUnauthorized = isAllowedUnauthorized;
	}
	public setRule(methodToScopeRule: MethodToScopeRule): void {
		this.rule = methodToScopeRule;
	}
	public pushToRuleList(methodToScopeRule: MethodToScopeRule): void {
		this.routeToScoupeList.push(methodToScopeRule);
	}

	// Reset
	reset() {
		this.namespace = '' as Namespaces;
		this.scopes = [];
		this.userId = '' as string;
		this.isAllowedUnauthorized = false;
		this.rule = {} as MethodToScopeRule;
	}
}

// Simple interface for building the response/result
export interface IReturn {
	returnOk(): ICommonErrorResponse;
	returnError(status: number, error: string): ICommonErrorResponse;
}

export class AuthReturn extends AuthParams implements IReturn {
	returnOk(): IAuthResponse {
		return {
			status: StatusCodes.OK,
			error: '',
			data: {
				userId: this.getUserId(),
				scopes: this.getScopes() as string[],
				namespace: this.getNamespace(),
				isAllowedUnauthorized: this.getIsAllowedUnauthorized(),
			},
		};
	}

	returnError(status: number, error: string): IAuthResponse {
		return {
			status: status,
			error: error,
			data: {
				userId: '',
				scopes: [],
				namespace: this.getNamespace(),
				isAllowedUnauthorized: this.getIsAllowedUnauthorized(),
			},
		};
	}
}

export interface IAuthHandler extends IAPIGuard, IReturn, IAuthParams {
	oauthProvider: IOAuthProvider;
	setOAuthProvider(oauthProvider: IOAuthProvider): void;
	setUserInfoStrategy(strategy: IUserInfoFetcher): void;
	setNext(handler: IAuthHandler): IAuthHandler;
	handle(request: Request, response: Response): Promise<IAuthResponse>;
}

export class RuleRoutine extends AuthReturn implements IReturn {
	protected getNamespaceFromRequest(req: Request): Namespaces | null {
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
				decoded = jwtDecode(req.body.credential);
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
	protected findNetworkInBody(body: string): string | null {
		const matches = body.match(DefaultNetworkPattern);
		if (matches && matches.length > 0) {
			return matches[1];
		}
		return null;
	}
	protected switchNetwork(network: string): Namespaces | null {
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
	protected findRule(route: string, method: string, namespace = Namespaces.Testnet): MethodToScopeRule | undefined {
		for (const rule of this.getRouteToScopeList()) {
			if (rule.doesRuleMatches(route, method, namespace)) {
				return rule;
			}
		}
		return undefined;	
	}
	
	protected registerRoute(route: string, method: string, scope: string, options = {}): void {
		this.pushToRuleList(new MethodToScopeRule(route, method, scope, options));
	}
}
