import type { LogtoApiError, UserCustomData } from '$shared/types';
import type { UserInfoResponse } from '@cntr/sveltekit';

export abstract class Database {
	abstract storeUser<TUser = UserInfoResponse, TResp = GenericResponse>(u: TUser): Promise<DatabaseResponse<TResp>>;
	abstract getUser<TUser = UserInfoResponse>(username: string): Promise<DatabaseResponse<TUser>>;
	abstract getUserData(userId: string): Promise<DatabaseResponse<UserCustomData>>;
	abstract updateUser<TUser = UserInfoResponse>(user: TUser): Promise<DatabaseResponse<TUser>>;
	abstract deleteUser<TResp = GenericResponse>(userId: string): Promise<DatabaseResponse<TResp>>;
}

export type DatabaseResponse<T> = LogtoApiError & {
	data?: T;
};

export type GenericResponse = Record<string | symbol | number, any>;
