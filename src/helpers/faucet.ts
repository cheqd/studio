import type { ICommonErrorResponse } from '../types/authentication.js';
import { DEFAULT_FAUCET_DENOM, FAUCET_URI } from '../types/constants.js';

export class FaucetHelper {
	// ...
	static async delegateTokens(address: string): Promise<ICommonErrorResponse> {
		const faucetURI = FAUCET_URI;
		const faucetBody = {
			denom: DEFAULT_FAUCET_DENOM,
			address: address,
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
