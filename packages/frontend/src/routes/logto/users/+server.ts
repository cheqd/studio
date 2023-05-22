import { env as pubEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import type { CustomDataRequest, UserCustomData } from '$shared/types';

export const GET = (async ({ fetch, locals }) => {
	try {
		const user = await locals.logto.fetchUserInfo();
		const uri = new URL(`/api/users/${user.sub}/custom-data`, pubEnv.PUBLIC_LOGTO_ENDPOINT);
		const bearerToken = locals.logto.bearerToken;

		if (!bearerToken) {
			return new Response(JSON.stringify({ error: 'access denied' }), { status: 401 });
		}

		const response = await fetch(uri, {
			headers: {
				Authorization: 'Bearer ' + bearerToken,
			},
		});

		const metadata = await response.json();
		if (response.status === 200) {
			return new Response(JSON.stringify(metadata));
		}
		return new Response(JSON.stringify({ error: 'error getting user custom data' }), { status: 400 });
	} catch (err) {
		return new Response(JSON.stringify({ error: (err as Error).message }), { status: 401 });
	}
}) satisfies RequestHandler;

export const PATCH = (async ({ fetch, request, locals }) => {
	let body = (await request.json()) as CustomDataRequest;
	const bearerToken = locals.logto.bearerToken;
	if (!bearerToken) {
		return new Response(JSON.stringify({ error: 'access denied' }), { status: 401 });
	}

	const user = await locals.logto.fetchUserInfo();

	const metadataResponse = await fetch('/logto/users');
	if (metadataResponse.status === 200) {
		const customData = (await metadataResponse.json()) as UserCustomData;
		// we need to do this since user data isn't updated, it's more of an overwrite operation.
		// reference: https://docs.logto.io/docs/references/users/custom-data
		body = { ...customData, ...body };
	}

	const uri = new URL(`/api/users/${user.sub}/custom-data`, pubEnv.PUBLIC_LOGTO_ENDPOINT);
	const response = await fetch(uri, {
		method: 'PATCH',
		body: JSON.stringify(body),
		headers: {
			Authorization: 'Bearer ' + bearerToken,
			'Content-Type': 'application/json',
		},
	});

	const data = await response.json();
	if (response.status === 200) {
		return new Response(JSON.stringify(data), { status: 200 });
	}

	return new Response(JSON.stringify({ error: 'error getting user custom data' }), { status: 400 });
}) satisfies RequestHandler;
