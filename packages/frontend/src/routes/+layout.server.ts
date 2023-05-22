import type { LayoutServerLoad } from './$types';

export const load = (async ({ parent, locals, fetch }) => {
	await parent();

	let issuers: string[] = [];
	const issuersResponse = await fetch('/logto/users');
	if (issuersResponse.status === 200) {
		issuers = ((await issuersResponse.json()) as { issuers: string[] }).issuers;
	}
	return {
		authenticated: await locals.logto.isAuthenticated(),
		issuers: issuers,
	};
}) satisfies LayoutServerLoad;