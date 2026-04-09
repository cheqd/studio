import type { ICommonErrorResponse } from '../types/authentication.js';
import { 
	MINIMAL_DENOM, 
	FAUCET_URI, 
	FAUCET_AMOUNT, 
	FAUCET_API_KEY, 
	FAUCET_ACCESS_CLIENT_ID, 
	FAUCET_ACCESS_CLIENT_SECRET 
} from '../types/constants.js';

export class FaucetHelper {
	// ...
	static async delegateTokens(
		address: string,
		firstName: string,
		lastName: string,
		email: string
	): Promise<ICommonErrorResponse> {
		const faucetURI = FAUCET_URI;
		const faucetBody = {
			denom: MINIMAL_DENOM,
			address: address,
			email: email,
			first_name: firstName,
			last_name: lastName,
			company: 'Requested via cheqd Studio',
			amount: FAUCET_AMOUNT,
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
		});
		return {
			status: response.status,
			error: await response.text(),
			data: {},
		};
	}
	// ...
}
