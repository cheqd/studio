import type { ICommonErrorResponse } from '../types/authentication.js';
import { MINIMAL_DENOM, FAUCET_URI, FAUCET_AMOUNT, FAUCET_API_KEY } from '../types/constants.js';

export class FaucetHelper {
	// ...
	static async delegateTokens(address: string, firstName: string, lastName: string, email: string): Promise<ICommonErrorResponse> {
		const faucetURI = FAUCET_URI;
		const faucetBody = {
			denom: MINIMAL_DENOM,
			address: address,
			email,
			firstName,
			lastName,
			company: 'Requested via cheqd Studio',
			amount: FAUCET_AMOUNT,
			marketing_optin: false,
		};
		const response = await fetch(faucetURI, {
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': FAUCET_API_KEY,
			},
			body: JSON.stringify(faucetBody),
			method: 'POST',
		});
		return {
			status: response.status,
			error: await response.text(),
			data: {},
		};
	}
	// ...
}
