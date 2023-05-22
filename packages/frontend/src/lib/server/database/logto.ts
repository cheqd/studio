import { env as pubEnv } from '$env/dynamic/public';
import { env as privEnv } from '$env/dynamic/private';
import type { Database, DatabaseResponse, GenericResponse } from '$lib/server/database';
import type {
	AuthenticationTokenResponse,
	Fetch,
	LogtoApiResponse,
	LogToIdentity,
	UserCustomData,
} from '$shared/types';
import type { LogtoClient, UserInfoResponse } from '@cntr/sveltekit';

export class LogtoDatabase implements Database {
	private readonly logto: LogtoClient;
	private readonly fetch: Fetch;

	constructor(logtoClient: LogtoClient, fetch: Fetch) {
		this.logto = logtoClient;
		this.fetch = fetch;
	}

	// This is unusable in case of LogTo. At Signup/Signin, Logto automatically inserts the user into database.
	storeUser = async <TUser = UserInfoResponse, TResp = GenericResponse>(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		u: TUser
	): Promise<DatabaseResponse<TResp>> => {
		const authToken = await this.getAccessToken();
		if (authToken.error) {
			return {
				error: authToken.error,
				error_description: authToken.error_description,
			};
		}

		return {
			data: {
				success: true,
			},
		} as DatabaseResponse<TResp>; // just a temporary hack. We'll re-write this when we get the need to use this method
	};

	// we don't need to use the supplied username in this case, fetchUserInfo uses the user scoped cookies to
	// fetch user details internally.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	getUser = async <UserInfoResponse>(username: string): Promise<DatabaseResponse<UserInfoResponse>> => {
		const authToken = await this.getAccessToken();
		if (authToken.error) {
			return {
				error: authToken.error,
				error_description: authToken.error_description,
			};
		}

		try {
			const response = await this.logto.fetchUserInfo();
			return {
				data: response,
			} as DatabaseResponse<UserInfoResponse>;
		} catch (err) {
			return {
				error: (err as Error).name,
				error_description: (err as Error).message,
			};
		}
	};

	getUserData = async (userId: string): Promise<DatabaseResponse<UserCustomData>> => {
		const authToken = await this.getAccessToken();
		if (authToken.error) {
			return {
				error: authToken.error,
				error_description: authToken.error_description,
			};
		}

		try {
			const uri = new URL(`/api/users/${userId}/custom-data`, pubEnv.PUBLIC_LOGTO_ENDPOINT);

			const response = await this.fetch(uri, {
				headers: {
					Authorization: 'Bearer ' + authToken.data.access_token,
				},
			});

			const metadata = (await response.json()) as UserCustomData;

			if (response.status === 200) {
				return {
					data: metadata,
				} as DatabaseResponse<UserCustomData>;
			}
		} catch (err) {
			return {
				error_description: (err as Error).message,
				error: (err as Error).name,
			};
		}

		return {
			error_description: 'error getting user credential data',
			error: 'internal server error',
		};
	};

	private getAccessToken = async (): Promise<LogtoApiResponse<AuthenticationTokenResponse>> => {
		const searchParams = new URLSearchParams({
			grant_type: 'client_credentials',
			resource: privEnv.LOGTO_RESOURCE_URL,
			scope: 'all',
		});

		const uri = new URL('/oidc/token', pubEnv.PUBLIC_LOGTO_ENDPOINT);
		const token = `Basic ${btoa(privEnv.LOGTO_MANAGEMENT_APP_ID + ':' + privEnv.LOGTO_MANAGEMENT_APP_SECRET)}`;

		// we use global fetch here, SvelteKit fetch throws CORS error
		const response = await fetch(uri, {
			method: 'POST',
			body: searchParams,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: token,
			},
		});
		const data = await response.json();
		if (response.status === 200) {
			const authResponse = data as AuthenticationTokenResponse;
			return {
				data: authResponse,
			} as LogtoApiResponse<AuthenticationTokenResponse>;
		}

		return {
			...data,
		};
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	updateUser = async <T>(user: T): Promise<DatabaseResponse<T>> => {
		throw Error('not implemented');
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	deleteUser = async <T>(userId: string): Promise<DatabaseResponse<T>> => {
		throw Error('not implemented');
	};

	getUserProfile = async (profile: string): Promise<DatabaseResponse<LogToIdentity>> => {
		try {
			const user = await this.logto.fetchUserInfo();
			if (user.identities) {
				const identity = user.identities[profile] as LogToIdentity;
				if (identity) {
					return {
						data: identity,
					} as DatabaseResponse<LogToIdentity>;
				}
			}

			return {
				error: 'PROFILE_NOT_CONNECTED',
				error_description: `profile "${profile}" is not connected for the user`,
			};
		} catch (err) {
			return {
				error_description: (err as Error).message,
				error: (err as Error).name,
			};
		}
	};
}