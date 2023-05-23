import { env as pubEnv } from '$env/dynamic/public';
import { env as privEnv } from '$env/dynamic/private';
import type { AuthenticationTokenResponse } from '$shared/types';

export const getLogtoAuthTokenForM2M = async (resource: string, grant_type='client_credentials') => {
	
	const searchParams = new URLSearchParams({
		grant_type: grant_type,
		resource: resource,
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

	if (response.status === 200) {
		const authResponse = (await response.json()) as AuthenticationTokenResponse;
		return authResponse.access_token;
	}
};