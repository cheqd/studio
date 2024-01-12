import type { ICommonErrorResponse } from '../../../types/authentication.js';

const { LOGTO_ENDPOINT } = process.env;

export interface IOAuthProvider {
	endpoint_issuer: string;
	endpoint_jwks: string;
	getAllScopes(): string[] | void;
	getDefaultScopes(): string[] | void;
	getAllResourcesWithNames(): string[] | void;
	getUserScopes(userId: string): Promise<ICommonErrorResponse>;
	getAppScopes(appId: string): Promise<ICommonErrorResponse>;
	getScopesForRoles(rolesList: string[]): Promise<string[] | void>;
}

export abstract class OAuthProvider implements IOAuthProvider {
	endpoint_issuer: string = LOGTO_ENDPOINT + '/oidc';
	endpoint_jwks: string = LOGTO_ENDPOINT + '/oidc/jwks';

	getAllScopes(): string[] | void {
		throw new Error('Method not implemented.');
	}
	getDefaultScopes(): string[] | void {
		throw new Error('Method not implemented.');
	}
	getAllResourcesWithNames(): string[] | void {
		throw new Error('Method not implemented.');
	}
	getUserScopes(userId: string): Promise<ICommonErrorResponse> {
		throw new Error('Method not implemented.');
	}
	getAppScopes(appId: string): Promise<ICommonErrorResponse> {
		throw new Error('Method not implemented.');
	}
	getScopesForRoles(rolesList: string[]): Promise<string[] | void> {
		throw new Error('Method not implemented.');
	}
}
