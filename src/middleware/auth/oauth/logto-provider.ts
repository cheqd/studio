import type { ICommonErrorResponse } from '../../../types/authentication.js';
import { LogToHelper } from '../logto-helper.js';
import { IOAuthProvider, OAuthProvider } from './base.js';

export class LogToProvider extends OAuthProvider implements IOAuthProvider {
	private logToHelper: LogToHelper;

	constructor() {
		super();
		this.logToHelper = new LogToHelper();
	}

	public setHelper(logToHelper: LogToHelper): void {
		this.logToHelper = logToHelper;
	}

	public getAllScopes(): string[] | void {
		if (this.logToHelper) {
			return this.logToHelper.getAllScopes();
		}
	}

	public getDefaultScopes(): string[] | void {
		if (this.logToHelper) {
			return this.logToHelper.getDefaultScopes();
		}
	}

	public getAllResourcesWithNames(): string[] | void {
		if (this.logToHelper) {
			return this.logToHelper.getAllResourcesWithNames();
		}
	}

	public async getUserScopes(userId: string): Promise<ICommonErrorResponse> {
		return await this.logToHelper.getUserScopes(userId);
	}

	public async getScopesForRoles(rolesList: string[]): Promise<string[] | void> {
		if (this.logToHelper) {
			const scopes = await this.logToHelper.getScopesForRolesList(rolesList);
			if (scopes) {
				return scopes.data;
			}
		}
	}
}
