import { CheqdNetwork } from '@cheqd/sdk';
import type { Request } from 'express';
import { DefaultNetworkPattern } from './shared.js';
import stringify from 'json-stringify-safe';
import { InvalidTokenError, jwtDecode } from 'jwt-decode';

export type AuthRuleOptions = {
	allowUnauthorized?: boolean;
	skipNamespace?: boolean;
};

export class AuthRule {
	private route: string;
	private method: string;
	private scope: string;
	private options: AuthRuleOptions;

	constructor(
		route: string,
		method: string,
		scope: string,
		options: AuthRuleOptions = { allowUnauthorized: false, skipNamespace: false }
	) {
		this.route = route;
		this.method = method;
		this.scope = scope;
		this.options = options;
	}

	public validate(scope: string): boolean {
		return this.scope === scope;
	}

	public match(request: Request): boolean {
		const { path, method } = request;
		// Route may be /account/create which matches as is
		// Also it may be /did/deactivate/:did which matches only with regexp
		const directMatch = this.route === path && this.method === method;
		const matches = path.match(this.route);
		const regexpMatch = matches && matches.length > 0 && this.method === method;

		if (directMatch || regexpMatch) {
			return this.matchScope(request);
		}
		return false;
	}

	private matchScope(request: Request): boolean {
		// if namespace is not required - return true
		if (this.isSkipNamespace()) {
			return true;
		}
		const namespace = this.getNamespaceFromRequest(request);
		// If namespace is required and it's not provided - return false
		if (!namespace) {
			return false;
		}
		return this.scope.includes(namespace);
	}

	public isValidScope(scope: string): boolean {
		return this.validate(scope);
	}

	public areValidScopes(scopes: string[]): boolean {
		for (const scope of scopes) {
			if (this.isValidScope(scope)) {
				return true;
			}
		}
		return false;
	}

	// Utils
	protected getNamespaceFromRequest(req: Request): CheqdNetwork | null {
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

	protected switchNetwork(network: string): CheqdNetwork | null {
		switch (network) {
			case 'testnet':
				return CheqdNetwork.Testnet;
			case 'mainnet':
				return CheqdNetwork.Mainnet;
			default:
				return null;
		}
	}

	public isAllowedUnauthorized(): boolean {
		return this.options.allowUnauthorized || false;
	}

	public isSkipNamespace(): boolean {
		return this.options.skipNamespace || false;
	}

	public isEmpty(): boolean {
		return this.route === '' && this.method === '' && this.scope === '';
	}
}

// export interface IAuthResponse extends ICommonErrorResponse {
// 	status: number;
// 	data: {
// 		userId: string;
// 		customerId: string;
// 		scopes: string[];
// 		namespace: CheqdNetwork;
// 		isAllowedUnauthorized: boolean;
// 	};
// 	error: string;
// }

export interface ICommonErrorResponse {
	status: number;
	error: string;
	data: any;
}
