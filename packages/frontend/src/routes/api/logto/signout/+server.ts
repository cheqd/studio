import { isSvelteKitRedirect } from '$lib/helpers';
import type { RequestHandler } from './$types';

export const DELETE = (async (event) => {
    const { url, locals } = event;
    try {
        await locals.logto.signOut(url.origin);
        return new Response(null, { status: 204 });
    } catch (err) {
        if (isSvelteKitRedirect(err)) {
            return new Response(JSON.stringify({ location: err.location }), {
                status: 201,
                headers: { Location: err.location },
            });
        }
    }

    return new Response(JSON.stringify({ error: 'Unhandled exception' }), { status: 500 });
}) satisfies RequestHandler;
