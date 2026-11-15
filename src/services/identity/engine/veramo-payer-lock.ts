import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import { PaymentAccountService } from '../../api/payment-account.js';
import { withPayerLock } from '../ledger-lock.js';
import { sharedPayerLockSource } from '../payer-lock-pool.js';
import { statusListReference } from './artifact-refs.js';

/**
 * Serialises the Veramo engine's ledger writes on the same per-payer queue and lock the Credo engine uses
 * (`withPayerLock`, keyed by the payer's bech32 address), so a Veramo write and a Credo write from one customer
 * account cannot pick the same account sequence.
 */
export interface VeramoPayerLock {
	/** Runs `work` while holding the lock of the customer's payment account on `network`. */
	run<T>(customer: CustomerEntity | undefined, network: string | undefined, work: () => Promise<T>): Promise<T>;
}

/** The network of a `did:cheqd:<network>:...` identifier, or undefined for anything else. */
export function networkOfDid(did: unknown): string | undefined {
	if (typeof did !== 'string') return undefined;
	const [scheme, method, network] = did.split(':');
	return scheme === 'did' && method === 'cheqd' && network ? network : undefined;
}

/** The issuer DID's network for a credential (or list of credentials) that carries a status entry. */
export function networkOfCredential(credential: unknown): string | undefined {
	return networkOfDid(statusListReference(credential as never)?.issuer);
}

export interface VeramoPayerLockDependencies {
	/** The customer's payment-account address on a network, or undefined when there is none. */
	resolveAddress(customer: CustomerEntity, network: string): Promise<string | undefined>;
	withPayerLock: typeof withPayerLock;
	lockSource: Parameters<typeof withPayerLock>[0];
}

/**
 * With no resolvable payer (no customer, an unknown network, no payment account) the write runs without the lock:
 * nothing can be spent from an account that does not exist, and the write fails on its own with its usual error.
 */
export function createVeramoPayerLock(dependencies: VeramoPayerLockDependencies): VeramoPayerLock {
	return {
		async run(customer, network, work) {
			if (!customer || !network) return work();
			const address = await dependencies.resolveAddress(customer, network);
			if (!address) return work();
			return dependencies.withPayerLock(dependencies.lockSource, address, work);
		},
	};
}

let production: VeramoPayerLock | undefined;

/** The process-wide lock, on the shared lock pool and Studio's payment accounts. Built on first use. */
export function veramoPayerLock(): VeramoPayerLock {
	production ??= createVeramoPayerLock({
		resolveAddress: async (customer, network) => {
			const accounts = await PaymentAccountService.instance.find({ customer });
			return accounts.find((account) => account.namespace === network)?.address;
		},
		withPayerLock,
		get lockSource() {
			return sharedPayerLockSource();
		},
	});
	return production;
}
