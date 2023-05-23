import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals }) => {
	const authenticated = await locals.logto.isAuthenticated();
	if (authenticated) {
		return json({ authenticated }, { status: 200 });
	}

	return json({ error: 'access denied' }, { status: 401 });
}) satisfies RequestHandler;
