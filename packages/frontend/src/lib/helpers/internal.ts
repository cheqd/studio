import type { Redirect } from '@sveltejs/kit';

export const isSvelteKitRedirect = (val: any): val is Redirect => {
	return val && val.status !== undefined && val.location !== undefined;
};
