import { StatusCodes } from 'http-status-codes';

// CosmJS, when the payer account has never received tokens
const ACCOUNT_NOT_ON_CHAIN = /Account '(cheqd1[0-9a-z]+)' does not exist on chain/;
// The chain, when the payer cannot cover the fee
const INSUFFICIENT_FUNDS = /insufficient funds/i;

const FUNDING_HINT =
	'On testnet, request tokens with POST /account/faucet or in cheqd Studio under Account > Balances & Faucet; on mainnet, send CHEQ to the account.';

/**
 * Recognises a ledger write that failed because the payer account has no CHEQ, or too little to pay the fee, and
 * turns it into a 402 that tells the caller what to do. Returns undefined for any other error, so the caller keeps
 * its own handling.
 */
export function unfundedPayerFailure(error: unknown): { status: number; error: string } | undefined {
	const message = (error as Error)?.message || String(error);
	const notOnChain = message.match(ACCOUNT_NOT_ON_CHAIN);
	if (notOnChain) {
		return {
			status: StatusCodes.PAYMENT_REQUIRED,
			error: `Payment required: the payer account ${notOnChain[1]} has no CHEQ yet. ${FUNDING_HINT}`,
		};
	}
	if (INSUFFICIENT_FUNDS.test(message)) {
		return {
			status: StatusCodes.PAYMENT_REQUIRED,
			error: `Payment required: the payer account does not have enough CHEQ to pay the fee. ${FUNDING_HINT}`,
		};
	}
	return undefined;
}
