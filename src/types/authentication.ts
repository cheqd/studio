import { Request, Response } from 'express';

export enum Namespaces {
	Testnet = 'testnet',
	Mainnet = 'mainnet',
}

export class MethodToScope {
	private route: string;
	private method: string;
	private scope: string;
	private options: {
		allowUnauthorized: boolean;
		skipNamespace: boolean;
	};

	constructor(route: string, method: string, scope: string, { allowUnauthorized = false, skipNamespace = false }) {
		this.route = route;
		this.method = method;
		this.scope = scope;
		this.options = {
			allowUnauthorized,
			skipNamespace,
		};
	}

	public validate(scope: string): boolean {
		return this.scope === scope;
	}

	public isRuleMatches(route: string, method: string, namespace = Namespaces.Testnet): boolean {
		// If route is exactly the same - check method and scope
		if (this.route === route && this.method === method) {
			if (this.scope === '' || this.isSkipNamespace()) {
				return true;
			}
			return this.scope.includes(namespace);
		}
		// If route is not exactly the same - check if it matches as an regexp
		const matches = route.match(this.route);
		if (matches && matches.length > 0 && this.method === method) {
			if (this.scope === '' || this.isSkipNamespace()) {
				return true;
			}
			return this.scope.includes(namespace);
		}
		return false;
	}

	public getScope(): string {
		return this.scope;
	}

	public isAllowedUnauthorized(): boolean {
		return this.options.allowUnauthorized;
	}

	public isSkipNamespace(): boolean {
		return this.options.skipNamespace;
	}
}

export interface IAuthResponse {
	status: number;
	data: {
		customerId: string;
		scopes: string[];
		namespace: Namespaces;
	};
	error: string;
}

export interface ICommonErrorResponse {
	status: number;
	error: string;
	data: any;
}

export interface IAuthResourceHandler {
	setNext(handler: IAuthResourceHandler): IAuthResourceHandler;
	handle(request: Request, response: Response): Promise<IAuthResponse>;
	skipPath(path: string): boolean;

	// Getters
	getNamespace(): string;
	getScopes(): string[] | unknown;
	getCustomerId(): string;
	getToken(): string;
}
