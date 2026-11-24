import { beforeEach, describe, expect, it } from '@jest/globals';
import { createPayerResolver } from '../../../../src/services/identity/engine/credo/payer.js';
import { FakeStore } from './fakes.js';

describe('per-customer fee payer resolution', () => {
	let store: FakeStore;
	let resolvePayer: ReturnType<typeof createPayerResolver>;

	beforeEach(() => {
		store = new FakeStore();
		store.tenants.set('alice', 'tenant-a');
		store.tenants.set('bob', 'tenant-b');
		store.addPayer('alice', 'testnet', 'cheqd1alice');
		store.addPayer('bob', 'testnet', 'cheqd1bob');
		store.addPayer('alice', 'mainnet', 'cheqd1alicemain');
		resolvePayer = createPayerResolver(store);
	});

	it('resolves each tenant to its own customer’s payment account and key', async () => {
		expect(await resolvePayer({ tenantId: 'tenant-a', network: 'testnet' })).toEqual({
			privateKeyHex: 'alice-secret',
			address: 'cheqd1alice',
		});
		expect(await resolvePayer({ tenantId: 'tenant-b', network: 'testnet' })).toEqual({
			privateKeyHex: 'bob-secret',
			address: 'cheqd1bob',
		});
	});

	it('picks the account for the network of the write', async () => {
		expect((await resolvePayer({ tenantId: 'tenant-a', network: 'mainnet' })).address).toBe('cheqd1alicemain');
	});

	it('never returns another customer’s account, whatever the network', async () => {
		await expect(resolvePayer({ tenantId: 'tenant-b', network: 'mainnet' })).rejects.toThrow(
			'no mainnet payment account'
		);
	});

	it('refuses a write with no tenant: there is no silent default payer', async () => {
		await expect(resolvePayer({ network: 'testnet' })).rejects.toThrow('needs a customer tenant');
		await expect(resolvePayer({ tenantId: '', network: 'testnet' })).rejects.toThrow('needs a customer tenant');
	});

	it('refuses an unknown tenant', async () => {
		await expect(resolvePayer({ tenantId: 'tenant-zzz', network: 'testnet' })).rejects.toThrow(
			'No customer owns this Credo tenant'
		);
	});

	it('refuses a tenant id that two customers share rather than guess', async () => {
		store.tenants.set('mallory', 'tenant-a');
		await expect(resolvePayer({ tenantId: 'tenant-a', network: 'testnet' })).rejects.toThrow(
			'No customer owns this Credo tenant'
		);
	});

	it('refuses when the payment account key is missing from the key store', async () => {
		store.privateKeys.clear();
		await expect(resolvePayer({ tenantId: 'tenant-a', network: 'testnet' })).rejects.toThrow(
			'not in the key store'
		);
	});
});
