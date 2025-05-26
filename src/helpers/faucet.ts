import type { ICommonErrorResponse } from '../types/authentication.js';
import { MINIMAL_DENOM, FAUCET_URI, FAUCET_AMOUNT } from '../types/constants.js';

export class FaucetHelper {
	// ...
	static async delegateTokens(address: string, name: string, email: string): Promise<ICommonErrorResponse> {
		const faucetURI = FAUCET_URI;
		const faucetBody = {
			denom: MINIMAL_DENOM,
			address: address,
			email,
			name,
			company: 'Requested via cheqd Studio',
			amount: FAUCET_AMOUNT,
			marketing_optin: false,
		};
		const response = await fetch(faucetURI, {
			headers: {
				'Content-Type': 'application/json',
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
