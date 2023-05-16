import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { error, fail } from '@sveltejs/kit';
import { isSvelteKitRedirect } from '$lib/helpers';
import { env as privEnv } from '$env/dynamic/private';

export const load = (async ({ url }) => {
	const err = url.searchParams.get('err');
	const status = url.searchParams.get('err_status');
	const errDescription = url.searchParams.get('err_description');
	if (err) {
		throw error(Number(status), {
			message: errDescription!,
		});
	}
}) satisfies PageServerLoad;

export const actions: Actions = {
	signinWithLogto: async (event: RequestEvent) => {
		const uri = new URL('/logto/callback', event.url.href);
		try {
			await event.locals.logto.signIn(uri.toString());
		} catch (err) {
			if (isSvelteKitRedirect(err)) {
				return {
					location: err.location,
				};
			}

			return fail(400, {
				error: 'error performing signin with Logto',
			});
		}
		
	},
	signout: async (event: RequestEvent) => {
		const response = await event.fetch('/api/logto/signout', {
			method: 'DELETE',
			redirect: 'manual',
		});

		if (response.status === 201) {
			console.log("Success signout!")
			return {
				location: response.headers.get('Location'),
			};
		}

		return fail(401, {
			error: await response.text(),
		});
	},
};
