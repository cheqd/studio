import type { CredentialClaimStatusType, CredentialMeta, LogtoApiError, UserCustomData } from '$shared/types';
import type { UserInfoResponse } from '@cntr/sveltekit';

export abstract class Database {
	abstract storeUser<TUser = UserInfoResponse, TResp = GenericResponse>(u: TUser): Promise<DatabaseResponse<TResp>>;
	abstract getUser<TUser = UserInfoResponse>(username: string): Promise<DatabaseResponse<TUser>>;
	abstract getUserCredentials(userId: string): Promise<DatabaseResponse<UserCustomData>>;
	abstract updateUser<TUser = UserInfoResponse>(user: TUser): Promise<DatabaseResponse<TUser>>;
	abstract deleteUser<TResp = GenericResponse>(userId: string): Promise<DatabaseResponse<TResp>>;
	abstract persistUserCredentials(
		userId: string,
		...credentialClaim: CredentialMeta[]
	): Promise<DatabaseResponse<GenericResponse>>;
	abstract updateEncryptedStorageLink(
		userId: string,
		credentialsEncryptedStorageLink: string,
	): Promise<DatabaseResponse<GenericResponse>>;
	abstract updateCredentialClaim(
		credentialId: string,
		status: CredentialClaimStatusType
	): Promise<DatabaseResponse<GenericResponse>>;
}

export type DatabaseResponse<T> = LogtoApiError & {
	data?: T;
};

export type GenericResponse = Record<string | symbol | number, any>;
