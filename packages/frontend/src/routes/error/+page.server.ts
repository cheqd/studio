import { error } from '@sveltejs/kit';
import type { PageServerLoad } from '../$types';

export const load = (async (event) => {
	if (event.locals.serverError) {
		throw error(400, {
			message: event.locals.serverError.message,
		});
	}

	return {};
}) satisfies PageServerLoad;
