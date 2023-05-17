import type {PageServerLoad } from './$types';

export const load = (async ({ parent, locals, fetch }) => {
	await parent();

	let userInfo = "";
	const userResponse = await fetch('/logto/users');
	if (userResponse.status === 200) {
		userInfo = await userResponse.json();
        console.log(userInfo)
	}
	return {
		authenticated: await locals.logto.isAuthenticated(),
        userInfo: userInfo,
        bearerToken: locals.logto.bearerToken,
	};
}) satisfies PageServerLoad;