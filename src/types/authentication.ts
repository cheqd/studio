import type { Request, Response } from 'express';

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

	public doesRuleMatches(route: string, method: string, namespace = Namespaces.Testnet): boolean {
		// If route and method are exactly the same - check scope
		if (this.route === route && this.method === method) {
			return this.checkScope(namespace);
		}
		// If route is not exactly the same - check if it matches as an regexp
		const matches = route.match(this.route);
		if (matches && matches.length > 0 && this.method === method) {
			return this.checkScope(namespace);
		}
		return false;
	}

	private checkScope(namespace: string): boolean {
		if (this.scope === '' || this.isSkipNamespace()) {
			return true;
		}
		// If namespace is required and it's not provided - return false
		if (!namespace) {
			return false;
		}
		return this.scope.includes(namespace);
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
		logToId: string;
		scopes: string[];
		namespace: Namespaces;
		isAllowedUnauthorized: boolean;
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
	getLogToId(): string;
	getToken(): string;
}
