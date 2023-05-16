import type { AuthenticationTokenResponse } from '$shared/types';
import type { LogtoClient } from '@cntr/sveltekit';
// See https://kit.svelte.dev/docs/types#app

// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			status?: number;
			message?: string;
		}
		// interface Error {}
		interface Locals {
			logto: logtoClient;
			user: import('@cntr/sveltekit').UserInfoResponse | null;
			serverError?: {
				message: string;
			};
		}
		// interface PageData {}
		// interface Platform {}
	}
}

type logtoClient = LogtoClient & {
	bearerToken?: string;
};

export {};
