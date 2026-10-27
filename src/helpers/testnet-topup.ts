/**
 * Whether the one-time testnet top-up applies on this call.
 *
 * It is for a customer created by the call. `CustomerService.create` also creates the customer's default testnet payment
 * account, so by the time the accounts are read the testnet account always exists. Checking for a missing testnet
 * account alone therefore never matches a new sign-up, and nobody was topped up.
 *
 * @param customerCreatedNow - the call created the customer (and so its testnet account)
 * @param hadTestnetAccount - the customer already had a testnet payment account when the accounts were read
 */
export function isNewTestnetAccount(customerCreatedNow: boolean, hadTestnetAccount: boolean): boolean {
	return customerCreatedNow || !hadTestnetAccount;
}
