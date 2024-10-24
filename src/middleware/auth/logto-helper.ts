import type { ICommonErrorResponse } from '../../types/authentication.js';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import type { IOAuthProvider } from './oauth/abstract.js';
import { OAuthProvider } from './oauth/abstract.js';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import { env } from 'node:process';
import { SupportedPlanTypes } from '../../types/admin.js';
dotenv.config();

export class LogToHelper extends OAuthProvider implements IOAuthProvider {
	private m2mToken: string;
	private allScopes: string[];
	private allResourceWithNames: string[];
	public defaultScopes: string[];
	private m2mGetTokenAttempts = 5;

	constructor() {
		super();
		this.m2mToken = '';
		this.allScopes = [];
		this.defaultScopes = [];
		this.allResourceWithNames = [];
	}

	public async setup(): Promise<ICommonErrorResponse> {
		let _r = {} as ICommonErrorResponse;
		_r = await this.setM2MToken();
		if (_r.status !== StatusCodes.OK) {
			return _r;
		}
		_r = await this.setDefaultScopes();
		if (_r.status !== StatusCodes.OK) {
			return _r;
		}
		_r = await this.setAllScopes();
		if (_r.status !== StatusCodes.OK) {
			return _r;
		}
		_r = await this.setAllResourcesWithNames();
		if (_r.status !== StatusCodes.OK) {
			return _r;
		}
		return this.returnOk({});
	}

	private async getM2MToken(): Promise<string> {
		if (!this.m2mToken || this.isTokenExpired(this.m2mToken)) {
			for (let i = 0; i < this.m2mGetTokenAttempts; i++) {
				const response = await this.setM2MToken();
				if (response.status === StatusCodes.OK) {
					return this.m2mToken;
				}
				await eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						'Failed to get M2M token, Attempt ' + i + ' of ' + this.m2mGetTokenAttempts,
						'M2M token issuing'
					),
					severity: 'error',
				});
			}
			throw new Error('Failed to get M2M token after ' + this.m2mGetTokenAttempts + ' attempts');
		}
		return this.m2mToken;
	}

	private isTokenExpired(token: string): boolean {
		const { exp } = jwt.decode(token) as {
			exp: number;
		};
		return Date.now() >= exp * 1000;
	}
	public getAllScopes(): string[] {
		return this.allScopes;
	}

	public getDefaultScopes(): string[] {
		return this.defaultScopes;
	}

	public getAllResourcesWithNames(): string[] {
		return this.allResourceWithNames;
	}

	private returnOk(data: any): ICommonErrorResponse {
		return {
			status: StatusCodes.OK,
			error: '',
			data: data,
		};
	}

	private returnError(status: number, error: string, data: any = {}): ICommonErrorResponse {
		return {
			status: status,
			error: error,
			data: data,
		};
	}

	// Scopes
	public async getUserScopes(userId: string): Promise<ICommonErrorResponse> {
		const scopes = [] as string[];
		const roles = await this.getRolesForUser(userId);
		if (roles.status !== StatusCodes.OK) {
			return this.returnError(StatusCodes.BAD_GATEWAY, roles.error);
		}
		// Check that default role is set
		for (const role of roles.data) {
			const _s = await this.getScopesForRole(role.id);
			if (_s.status === StatusCodes.OK) {
				scopes.push(..._s.data);
			}
		}
		return this.returnOk(scopes);
	}

	public async getAppScopes(appId: string): Promise<ICommonErrorResponse> {
		const scopes = [] as string[];
		const roles = await this.getRolesForApp(appId);
		if (roles.status !== StatusCodes.OK) {
			return this.returnError(StatusCodes.BAD_GATEWAY, roles.error);
		}
		// Check that default role is set
		for (const role of roles.data) {
			const _s = await this.getScopesForRole(role.id);
			if (_s.status === StatusCodes.OK) {
				scopes.push(..._s.data);
			}
		}
		return this.returnOk(scopes);
	}

	private async setDefaultScopes(): Promise<ICommonErrorResponse> {
		const _r = await this.getAllResources();
		if (_r.status !== StatusCodes.OK) {
			return this.returnError(
				StatusCodes.BAD_GATEWAY,
				`Looks like ${process.env.LOGTO_DEFAULT_RESOURCE_URL} is not setup on LogTo side`
			);
		}
		for (const r of _r.data) {
			if (r.indicator === process.env.LOGTO_DEFAULT_RESOURCE_URL) {
				const _rr = await this.getScopesForResource(r.id);
				if (_rr.status === StatusCodes.OK) {
					this.defaultScopes = _rr.data;
					return this.returnOk({});
				} else {
					return _rr;
				}
			}
		}
		return this.returnError(
			StatusCodes.BAD_GATEWAY,
			`Looks like resource with id ${process.env.LOGTO_DEFAULT_RESOURCE_URL} is not placed on LogTo`
		);
	}

	private async setAllScopes(): Promise<ICommonErrorResponse> {
		const allResources = await this.getAllResources();
		if (allResources.status !== StatusCodes.OK) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `setAllScopes: Error while getting all resources`);
		}
		for (const resource of allResources.data) {
			if (resource.id !== 'management-api') {
				const scopes = await this.getScopesForResource(resource.id);
				if (scopes.status !== StatusCodes.OK) {
					return this.returnError(
						StatusCodes.BAD_GATEWAY,
						`setAllScopes: Error while getting the scopes for ${resource.id}`
					);
				}
				this.allScopes = this.allScopes.concat(scopes.data);
			}
		}
		return this.returnOk({});
	}

	private async getScopesForRole(roleId: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/roles/${roleId}/scopes`, process.env.LOGTO_ENDPOINT);
		const scopes = [];

		try {
			const metadata = await this.getToLogto(uri, 'GET');
			if (metadata && metadata.status !== StatusCodes.OK) {
				return this.returnError(
					StatusCodes.BAD_GATEWAY,
					`askRoleForScopes: Error while getting the all scopes for the role ${roleId}`
				);
			}
			for (const sc of metadata.data) {
				scopes.push(sc.name);
			}
			return this.returnOk(scopes);
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `askRoleForScopes ${err}`);
		}
	}

	private async getScopesForResource(resourceId: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/resources/${resourceId}/scopes`, process.env.LOGTO_ENDPOINT);
		const scopes = [];

		try {
			const metadata = await this.getToLogto(uri, 'GET');
			if (metadata && metadata.status !== StatusCodes.OK) {
				return this.returnError(
					StatusCodes.BAD_GATEWAY,
					`askResourceForScopes: Error while getting the all scopes for the resource ${resourceId}`
				);
			}
			for (const sc of metadata.data) {
				scopes.push(sc.name);
			}
			return this.returnOk(scopes);
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `askResourceForScopes ${err}`);
		}
	}

	public async getScopesForRolesList(roles: string[]): Promise<ICommonErrorResponse> {
		const scopes = [];
		for (const role of roles) {
			const roleId = await this.getRoleIdByName(role);
			if (roleId.status !== StatusCodes.OK) {
				return this.returnError(StatusCodes.BAD_GATEWAY, roleId.error);
			}
			const _r = await this.getScopesForRole(roleId.data);
			if (_r.status !== StatusCodes.OK) {
				return _r;
			}
			scopes.push(..._r.data);
		}
		return this.returnOk(scopes);
	}

	// Roles
	public async getRolesForUser(userId: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/users/${userId}/roles`, process.env.LOGTO_ENDPOINT);
		try {
			// Note: By default, the API returns first 20 roles.
			// If our roles per user grows to more than 20, we need to implement pagination
			return await this.getToLogto(uri, 'GET');
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `getRolesForUser ${err}`);
		}
	}

	public async getRolesForApp(appId: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/applications/${appId}/roles`, process.env.LOGTO_ENDPOINT);
		try {
			// Note: By default, the API returns first 20 roles.
			// If our roles per user grows to more than 20, we need to implement pagination
			return await this.getToLogto(uri, 'GET');
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `getRolesForUser ${err}`);
		}
	}

	async assignCustomerPlanRoles(userId: string, planType: SupportedPlanTypes): Promise<ICommonErrorResponse> {
		const [userInfo, userRoles] = await Promise.all([this.getUserInfo(userId), this.getRolesForUser(userId)]);

		if (userInfo.status !== StatusCodes.OK) {
			return this.returnError(userInfo.status, 'Could not fetch the info about the user');
		}
		// Means that user exists
		if (userInfo.data.isSuspended) {
			return this.returnError(StatusCodes.FORBIDDEN, 'User is suspended');
		}

		if (userRoles.status !== StatusCodes.OK) {
			return this.returnError(userRoles.status, 'Could not fetch the info about user roles');
		}

		const assignedRoleIds = (userRoles.data as { id: string; name: string }[]).map((role) => role.id);

		// INFO: Context
		// We currently have two plans, Build and Test.
		// All of our users get a "Portal" role which let's them work with our Studio Portal (UI)
		// Test plan lets you operate with our Testnet so we assign the "Testnet" role
		// Build plan lets you work with our Testnet and Mainnet, so we assign "Testnet" and "Mainnet" roles
		// "build" is the superset of all the roles (testnet + mainnet)
		const buildPlanRoleIds = [env.LOGTO_MAINNET_ROLE_ID.trim(), env.LOGTO_TESTNET_ROLE_ID.trim()];
		const testPlanRoleId = env.LOGTO_TESTNET_ROLE_ID.trim();
		const hasDefaultPortalRole = assignedRoleIds.findIndex((roleId) => roleId === env.LOGTO_DEFAULT_ROLE_ID) != -1;

		const planRoleIds = hasDefaultPortalRole ? [] : [env.LOGTO_DEFAULT_ROLE_ID.trim()];
		if (planType === SupportedPlanTypes.Build) {
			const buildRoleIsAssigned = buildPlanRoleIds.every((roleId) => assignedRoleIds.includes(roleId));
			if (buildRoleIsAssigned) {
				return {
					status: 201,
					error: '',
					data: {
						message: `${planType} plan role was successfully assigned to the user`,
					},
				};
			}

			const billingPlanRoleIds = buildPlanRoleIds.filter((id) => !assignedRoleIds.includes(id));
			planRoleIds.push(...billingPlanRoleIds);
		} else if (planType === SupportedPlanTypes.Test) {
			// "build" plan is a superset of "test" plan

			// check the user has mainnet role, remove it
			const mainnetRoleId = assignedRoleIds.find((roleId) => roleId === buildPlanRoleIds[0]);
			if (mainnetRoleId) {
				await this.removeLogtoRoleFromUser(userId, mainnetRoleId);
			}

			const testnetRoleId = assignedRoleIds.find((roleId) => roleId === testPlanRoleId);
			if (testnetRoleId) {
				return {
					status: 201,
					error: '',
					data: {
						message: `${planType} plan role was successfully assigned to the user`,
					},
				};
			}

			planRoleIds.push(testPlanRoleId);
		}

		try {
			const uri = new URL(`/api/users/${userId}/roles`, process.env.LOGTO_ENDPOINT);
			const body = {
				roleIds: planRoleIds,
			};

			return await this.postToLogto(uri, body, { 'Content-Type': 'application/json' });
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `getRolesForUser ${err}`);
		}
	}

	async removeLogtoRoleFromUser(userId: string, roleId: string) {
		const uri = new URL(`/api/users/${userId}/roles/${roleId}`, process.env.LOGTO_ENDPOINT);

		try {
			const response = await fetch(uri, {
				method: 'DELETE',
				headers: {
					Authorization: 'Bearer ' + (await this.getM2MToken()),
				},
			});

			// check if role is removed or doesn't to begin with
			if (response.status === StatusCodes.NO_CONTENT || response.status === StatusCodes.NOT_FOUND) {
				return this.returnOk({});
			}

			const err = await response.text();
			return this.returnError(response.status, err);
		} catch (err) {
			return this.returnError(StatusCodes.INTERNAL_SERVER_ERROR, `removeUserRole: ${err}`);
		}
	}

	private async getRoleIdByName(roleName: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/roles`, process.env.LOGTO_ENDPOINT);
		try {
			const metadata = await this.getToLogto(uri, 'GET');
			if (metadata && metadata.status !== StatusCodes.OK) {
				return this.returnError(StatusCodes.BAD_GATEWAY, `getRoleIdByName: Error while getting the all roles`);
			}
			for (const role of metadata.data) {
				if (role.name === roleName) {
					return this.returnOk(role.id);
				}
			}
			return this.returnError(
				StatusCodes.BAD_GATEWAY,
				`getRoleIdByName: Could not find role with name ${roleName}`
			);
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `getRoleIdByName ${err}`);
		}
	}

	// Users
	public async updateCustomData(userId: string, customData: any): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/users/${userId}/custom-data`, process.env.LOGTO_ENDPOINT);
		try {
			const body = {
				customData: customData,
			};
			return await this.patchToLogto(uri, body, { 'Content-Type': 'application/json' });
		} catch (err) {
			return this.returnError(500, `updateCustomData ${err}`);
		}
	}

	private async getUserInfo(userId: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/users/${userId}`, process.env.LOGTO_ENDPOINT);
		try {
			return await this.getToLogto(uri, 'GET');
		} catch (err) {
			return this.returnError(StatusCodes.SERVICE_UNAVAILABLE, `getUserInfo ${err}`);
		}
	}

	public async getCustomData(userId: string): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/users/${userId}/custom-data`, process.env.LOGTO_ENDPOINT);
		try {
			return await this.getToLogto(uri, 'GET');
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `getCustomData ${err}`);
		}
	}

	// Resources
	private async setAllResourcesWithNames(): Promise<ICommonErrorResponse> {
		const allResources = await this.getAllResources();
		if (allResources.status !== StatusCodes.OK) {
			return this.returnError(
				StatusCodes.BAD_GATEWAY,
				`setAllResourcesWithNames: Error while getting all resources. Error: ${allResources.error}`
			);
		}
		for (const resource of allResources.data) {
			this.allResourceWithNames.push(resource.indicator);
		}
		return this.returnOk({});
	}

	public async getAllResources(): Promise<ICommonErrorResponse> {
		const uri = new URL(`/api/resources`, process.env.LOGTO_ENDPOINT);

		try {
			return await this.getToLogto(uri, 'GET');
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, `getAllResources ${err}`);
		}
	}

	// Utils
	private async patchToLogto(uri: URL, body: any, headers: any = {}): Promise<ICommonErrorResponse> {
		const response = await fetch(uri, {
			headers: {
				...headers,
				Authorization: 'Bearer ' + this.m2mToken,
			},
			body: JSON.stringify(body),
			method: 'PATCH',
		});

		if (!response.ok) {
			return this.returnError(response.status, await response.json());
		}
		return this.returnOk({});
	}

	private async postToLogto(uri: URL, body: any, headers: any = {}): Promise<ICommonErrorResponse> {
		const response = await fetch(uri, {
			headers: {
				...headers,
				Authorization: 'Bearer ' + (await this.getM2MToken()),
			},
			body: JSON.stringify(body),
			method: 'POST',
		});

		if (!response.ok) {
			return this.returnError(StatusCodes.BAD_GATEWAY, await response.json());
		}
		return this.returnOk({});
	}

	private async getToLogto(uri: URL, headers: any = {}): Promise<ICommonErrorResponse> {
		const response = await fetch(uri, {
			headers: {
				...headers,
				Authorization: 'Bearer ' + (await this.getM2MToken()),
			},
			method: 'GET',
		});

		if (!response.ok) {
			return this.returnError(StatusCodes.BAD_GATEWAY, await response.json());
		}
		const metadata = await response.json();
		return this.returnOk(metadata);
	}

	private async setM2MToken(): Promise<ICommonErrorResponse> {
		const searchParams = new URLSearchParams({
			grant_type: 'client_credentials',
			resource: process.env.LOGTO_MANAGEMENT_API as string,
			scope: 'all',
		});

		const uri = new URL('/oidc/token', process.env.LOGTO_ENDPOINT);
		const token = `Basic ${btoa(process.env.LOGTO_M2M_APP_ID + ':' + process.env.LOGTO_M2M_APP_SECRET)}`;

		try {
			const response = await fetch(uri, {
				method: 'POST',
				body: searchParams,
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Authorization: token,
				},
			});
			if (!response.ok) {
				return this.returnError(
					StatusCodes.BAD_GATEWAY,
					'Error while bootstrapping the connection with authority server'
				);
			}
			const data = await response.json();
			this.m2mToken = data.access_token;
			return this.returnOk({});
		} catch (err) {
			return this.returnError(StatusCodes.BAD_GATEWAY, 'Error while communicating with authority server');
		}
	}
}
