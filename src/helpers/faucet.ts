import type { ICommonErrorResponse } from '../types/authentication.js';
import {
	MINIMAL_DENOM,
	FAUCET_URI,
	FAUCET_AMOUNT,
	FAUCET_API_KEY,
	FAUCET_ACCESS_CLIENT_ID,
	FAUCET_ACCESS_CLIENT_SECRET,
	FAUCET_REQUEST_TIMEOUT_SECONDS,
} from '../types/constants.js';

/** True if the error is the faucet call timing out or being aborted, as opposed to the faucet answering. */
export function isFaucetTimeout(error: unknown): boolean {
	const name = (error as { name?: string } | null)?.name;
	return name === 'TimeoutError' || name === 'AbortError';
}

export class FaucetHelper {
	// ...
	static async delegateTokens(
		address: string,
		firstName: string,
		lastName: string,
		email: string,
		amount = FAUCET_AMOUNT,
		timeoutMs = FAUCET_REQUEST_TIMEOUT_SECONDS * 1000
	): Promise<ICommonErrorResponse> {
		const faucetURI = FAUCET_URI;
		const faucetBody = {
			denom: MINIMAL_DENOM,
			address: address,
			email: email,
			first_name: firstName,
			last_name: lastName,
			company: 'Requested via cheqd Studio',
			amount,
			marketing_optin: false,
		};
		const response = await fetch(faucetURI, {
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': FAUCET_API_KEY,
				'CF-Access-Client-Id': FAUCET_ACCESS_CLIENT_ID,
				'CF-Access-Client-Secret': FAUCET_ACCESS_CLIENT_SECRET,
			},
			body: JSON.stringify(faucetBody),
			method: 'POST',
			// Covers waiting for the response and reading its body. On expiry fetch rejects with a TimeoutError.
			signal: AbortSignal.timeout(timeoutMs),
		});
		return {
			status: response.status,
			error: await response.text(),
			data: {},
		};
	}
	// ...
}
