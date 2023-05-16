import { env as pubEnv } from '$env/dynamic/public';
import { env as privEnv } from '$env/dynamic/private';
import type { Database, DatabaseResponse, GenericResponse } from '$lib/server/database';
import type {
	AuthenticationTokenResponse,
	CredentialClaimStatusType,
	CredentialMeta,
	CustomDataRequest,
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

	getUserCredentials = async (userId: string): Promise<DatabaseResponse<UserCustomData>> => {
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

			if (!metadata.credentials) {
				metadata.credentials = [];
			}
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

	updateCredentialClaim = async (
		credentialId: string,
		status: CredentialClaimStatusType
	): Promise<DatabaseResponse<GenericResponse>> => {
		const user = await this.logto.fetchUserInfo();
		const data = user.custom_data as UserCustomData;

		const credential = data.credentials.find((credential) => {
			if (credential.id === credentialId) {
				credential.status = status;
				return credential;
			}
		});
		if (!credential) {
			return {
				error: 'CREDENTIAL_NOT_FOUND',
				error_description: 'user does not have the requested credential',
			};
		}

		const { error, error_description } = await this.persistUserCredentials(user.sub, credential);
		if (error) {
			return {
				error_description: error_description,
				error: error,
			} as unknown as DatabaseResponse<GenericResponse>;
		}

		return {
			data: {
				message: 'credential status updated successfully',
			},
		} as unknown as DatabaseResponse<GenericResponse>;
	};

	updateCredentialClaimMultiple = async (
		credentialIds: string[],
		status: CredentialClaimStatusType
	): Promise<DatabaseResponse<GenericResponse>> => {
		const user = await this.logto.fetchUserInfo();
		const data = user.custom_data as UserCustomData;

		const credentials = data.credentials.filter((credential) => {
			if (credentialIds.includes(credential.id)) {
				credential.status = status;
				return credential;
			}
		});
		if (!credentials || credentials.length === 0) {
			return {
				error: 'CREDENTIALS_NOT_FOUND',
				error_description: 'user does not have the requested credential',
			};
		}

		const { error, error_description } = await this.persistUserCredentials(user.sub, ...credentials);
		if (error) {
			return {
				error_description: error_description,
				error: error,
			} as unknown as DatabaseResponse<GenericResponse>;
		}

		return {
			data: {
				message: 'credential status updated successfully',
			},
		} as unknown as DatabaseResponse<GenericResponse>;
	};

	persistUserCredentials = async (userId: string, ...data: CredentialMeta[]): Promise<DatabaseResponse<any>> => {
		if (data.length == 0) {
			return {
				error: 'INVALID_REQUEST',
				error_description: 'credential list cannot be empty',
			};
		}

		const authToken = await this.getAccessToken();
		if (authToken.error) {
			return {
				error: authToken.error,
				error_description: authToken.error_description,
			};
		}
		let user: UserInfoResponse;

		try {
			user = await this.logto.fetchUserInfo();
		} catch (err) {
			return {
				error: (err as Error).name,
				error_description: (err as Error).message,
			};
		}
		const existingData = await this.getUserCredentials(userId);
		if (!existingData.data || !existingData.data.credentials) {
			existingData.data = { credentials: [], credentialsEncryptedStorageLink: '' };
		}

        const body: CustomDataRequest = {
            customData: {
                credentials: [...data],
                credentialsEncryptedStorageLink: '',
            },
        };

		body.customData.credentials = dedupeCredentials([
			...existingData.data.credentials,
			...body.customData.credentials,
		]);

		try {
			const uri = new URL(`/api/users/${user.sub}/custom-data`, pubEnv.PUBLIC_LOGTO_ENDPOINT);
			const response = await this.fetch(uri, {
				method: 'PATCH',
				body: JSON.stringify(body),
				headers: {
					Authorization: 'Bearer ' + authToken.data.access_token,
					'Content-Type': 'application/json',
				},
			});

			const data = await response.json();
			if (response.status === 200) {
				return {
					data: data,
				} as DatabaseResponse<any>;
			}

			return { ...data };
		} catch (err) {
			return {
				error_description: (err as Error).message,
				error: (err as Error).name,
			};
		}
	};

	updateEncryptedStorageLink = async (userId: string, credentialsEncryptedStorageLink: string, bypass = false): Promise<DatabaseResponse<GenericResponse>> => {
		if (!credentialsEncryptedStorageLink && !bypass) {
            return {
                error: 'INVALID_REQUEST',
                error_description: 'encrypted storage link cannot be empty',
            } as unknown as Promise<DatabaseResponse<GenericResponse>>;
        }

		const authToken = await this.getAccessToken();
		if (authToken.error) {
			return {
				error: authToken.error,
				error_description: authToken.error_description,
			};
		}
		let user: UserInfoResponse;

		try {
			user = await this.logto.fetchUserInfo();
		} catch (err) {
			return {
				error: (err as Error).name,
				error_description: (err as Error).message,
			};
		}

		const existingData = await this.getUserCredentials(userId);

		// validate if credentialsEncryptedStorageLink has been altered, if not exit early
		if (existingData.data?.credentialsEncryptedStorageLink && existingData.data.credentialsEncryptedStorageLink === credentialsEncryptedStorageLink) {
			return {
				error: 'ENCRYPTED_STORAGE_LINK_ALREADY_EXISTS',
				error_description: 'credentialsEncryptedStorageLink already exists',
			};
		}

		if (!existingData.data || !existingData.data.credentials) {
			existingData.data = { credentials: [], credentialsEncryptedStorageLink: credentialsEncryptedStorageLink };
		}

		const body: CustomDataRequest = {
            customData: {
                credentials: existingData.data.credentials,
                credentialsEncryptedStorageLink,
            },
        };

		try {
			const uri = new URL(`/api/users/${user.sub}/custom-data`, pubEnv.PUBLIC_LOGTO_ENDPOINT);
			const response = await this.fetch(uri, {
				method: 'PATCH',
				body: JSON.stringify(body),
				headers: {
					Authorization: 'Bearer ' + authToken.data.access_token,
					'Content-Type': 'application/json',
				},
			});

			const data = await response.json();
			if (response.status === 200) {
				return {
					data,
				} as DatabaseResponse<any>;
			}

			return { ...data };
		} catch (err) {
			return {
				error_description: (err as Error).message,
				error: (err as Error).name,
			};
		}
	}

	updateUserPublicKey = async (userId: string, publicKey: string): Promise<DatabaseResponse<GenericResponse>> => {
		if (!publicKey) {
			return {
				error: 'INVALID_REQUEST',
				error_description: 'public key cannot be empty',
			} as unknown as Promise<DatabaseResponse<GenericResponse>>;
		}

		const authToken = await this.getAccessToken();
		if (authToken.error) {
			return {
				error: authToken.error,
				error_description: authToken.error_description,
			};
		}
		let user: UserInfoResponse;

		try {
			user = await this.logto.fetchUserInfo();
		} catch (err) {
			return {
				error: (err as Error).name,
				error_description: (err as Error).message,
			};
		}

		const existingData = await this.getUserCredentials(userId);

		// validate if publicKey has been altered, if not exit early
		if (existingData.data?.clientKeys?.publicKey && existingData.data?.clientKeys?.publicKey === publicKey) {
			return {
				error: 'PUBLIC_KEY_ALREADY_EXISTS',
				error_description: 'publicKey already exists',
			};
		}

		if (!existingData.data || !existingData.data.credentials) {
			existingData.data = { credentials: [], credentialsEncryptedStorageLink: '', clientKeys: { publicKey } };
		}

		const body: CustomDataRequest = {
			customData: {
				credentials: existingData.data?.credentials || [],
				credentialsEncryptedStorageLink: existingData.data.credentialsEncryptedStorageLink,
				clientKeys: {
					publicKey,
				},
			},
		};

		try {
			const uri = new URL(`/api/users/${user.sub}/custom-data`, pubEnv.PUBLIC_LOGTO_ENDPOINT);
			const response = await this.fetch(uri, {
				method: 'PATCH',
				body: JSON.stringify(body),
				headers: {
					Authorization: 'Bearer ' + authToken.data.access_token,
					'Content-Type': 'application/json',
				},
			});

			const data = await response.json();
			if (response.status === 200) {
				return {
					data,
				} as DatabaseResponse<any>;
			}

			return { ...data };
		} catch (err) {
			return {
				error_description: (err as Error).message,
				error: (err as Error).name,
			};
		}
	}
}

// makes the assumption of voucher ids being unique
// also makes the assumption that the newer item (which would be duplicate) exists towards the end of the list
const dedupeCredentials = (list: CredentialMeta[]) => {
	if (!list || list.length === 0) {
		return list;
	}

	const map = new Map<string, CredentialMeta>();
	for (let i = 0; i < list.length; i++) {
		const cm = list[i];
		map.set(cm.id, cm);
	}

	return Array.from(map.values());
};
