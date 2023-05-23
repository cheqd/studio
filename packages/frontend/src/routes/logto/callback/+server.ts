import type { UserInfoResponse } from '@cntr/sveltekit';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privEnv } from '$env/dynamic/private';

export const GET = (async ({ locals, url }) => {
	try {
		await locals.logto.handleSignInCallback(url.toString());
	} catch (err) {
		console.log('ERR_LOGTO_SIGNIN_CALLBACK: ', err);
		throw error(401, {
			message: (err as Error).message,
		});
	}

	let user: UserInfoResponse;
	try {
		user = await locals.logto.fetchUserInfo();
		console.log('USER: ', user);
	} catch (err) {
		// handleSignInCallback sets the user cookies when successful, if there's any error here,
		// we log the user out
		await locals.logto.signOut(url.origin);
		return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
	}

	throw redirect(301, '/');
}) as RequestHandler;
