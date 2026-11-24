import type { CredoEngineStore } from './ports.js';

/** What the Credo cheqd module's `resolvePayer` hook is called with (a subset of `CheqdPayerContext`). */
export interface PayerRequest {
	tenantId?: string;
	network: string;
}

/** What the hook returns: the customer's payment account key and the address it must belong to. */
export interface ResolvedPayer {
	privateKeyHex: string;
	address: string;
}

/**
 * The per-customer fee payer (decision D3). The Credo cheqd module calls this once per ledger write, with the
 * tenant the write runs for. It finds the customer that owns the tenant, then the customer's payment account on
 * that network, then decrypts that account's key through Studio's existing private key store: no new key handling.
 *
 * The tenant id arrives from the Credo agent context, never from a request, so a caller cannot ask to be charged
 * to someone else's account. The Credo module checks the returned address against the key and refuses a mismatch.
 */
export function createPayerResolver(
	store: Pick<CredoEngineStore, 'findCustomerIdByTenantId' | 'findPayerAccount' | 'readPayerPrivateKeyHex'>
) {
	return async function resolvePayer({ tenantId, network }: PayerRequest): Promise<ResolvedPayer> {
		if (!tenantId) throw new Error('A ledger write needs a customer tenant; none was supplied');

		const customerId = await store.findCustomerIdByTenantId(tenantId);
		if (!customerId) throw new Error('No customer owns this Credo tenant');

		const account = await store.findPayerAccount(customerId, network);
		if (!account) throw new Error(`The customer has no ${network} payment account`);

		const privateKeyHex = await store.readPayerPrivateKeyHex(account.kid);
		if (!privateKeyHex) throw new Error('The payment account key is not in the key store');

		return { privateKeyHex, address: account.address };
	};
}
