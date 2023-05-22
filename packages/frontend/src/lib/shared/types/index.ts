export type UserCustomData = {
	name: string
};

export type CustomDataRequest = {
	customData: UserCustomData;
};

export type AuthenticationTokenResponse = {
	access_token: string;
	expires_in: number;
	token_type: string;
	scope: string;
};

export type Fetch = typeof fetch;

export type LogtoApiError = {
	error: string;
	error_description: string;
};

export type LogtoApiResponse<T> = LogtoApiError & {
	data: T;
};

export type LogToIdentity = {
	userId: string;
	details?: Record<string, unknown>;
};
