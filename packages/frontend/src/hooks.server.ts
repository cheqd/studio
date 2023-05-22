import { redirect, type Handle } from '@sveltejs/kit';
import { LogtoAuthHandler, UserScope } from '@cntr/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { env as pubEnv } from '$env/dynamic/public';
import { env as privEnv } from '$env/dynamic/private';
import { getLogtoAuthTokenForM2M } from '$lib/utils';

const authenticationHandler: Handle = async ({ event, resolve }) => {
	const authenticated = await event.locals.logto.isAuthenticated();
	if (event.url.pathname === '/user' && !authenticated) {
		throw redirect(303, '/');
	}

	if (event.url.pathname === '/' && authenticated) {
		throw redirect(303, '/user');
	}

	return await resolve(event);
};

const setLogtoAuthTokenForM2M: Handle = async ({ event, resolve }) => {
	const token = await getLogtoAuthTokenForM2M(privEnv.LOGTO_RESOURCE_URL as string || "");
	event.locals.logto.bearerToken = token;

	return await resolve(event);
}

const setLogtoAuthenticatedUser: Handle = async ({ event, resolve }) => {
	try {
		const user = await event.locals.logto.fetchUserInfo();
		event.locals.user = user;
	} catch (err) {
		event.locals.user = null;
	}

	return await resolve(event);
};

export const handle = sequence(
	LogtoAuthHandler(pubEnv.PUBLIC_LOGTO_APP_ID as string, pubEnv.PUBLIC_LOGTO_ENDPOINT as string, [
		UserScope.Email,
		UserScope.Profile,
		UserScope.CustomData,
		UserScope.Identities,
	]),
	setLogtoAuthTokenForM2M,
	setLogtoAuthenticatedUser,
	authenticationHandler
);
