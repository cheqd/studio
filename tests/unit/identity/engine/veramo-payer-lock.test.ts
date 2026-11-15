import { describe, expect, it, jest } from '@jest/globals';
import { VeramoEngine } from '../../../../src/services/identity/engine/veramo-engine.js';
import {
	createVeramoPayerLock,
	networkOfCredential,
	networkOfDid,
} from '../../../../src/services/identity/engine/veramo-payer-lock.js';
import type { VeramoPayerLock } from '../../../../src/services/identity/engine/veramo-payer-lock.js';
import { withPayerLock } from '../../../../src/services/identity/ledger-lock.js';
import type { LockDataSource } from '../../../../src/services/identity/ledger-lock.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';

const did = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';
const customer = { customerId: 'c-1' } as never;
const statusEntry = { id: `${did}?resourceName=list&resourceType=BitstringStatusListCredential#1` };
const credential = { issuer: did, credentialStatus: statusEntry };

function setup() {
	const locks: { network: string | undefined; during: string[] }[] = [];
	const calls: string[] = [];
	const payerLock: VeramoPayerLock = {
		async run(_customer, network, work) {
			const record = { network, during: [] as string[] };
			locks.push(record);
			const before = calls.length;
			const result = await work();
			record.during = calls.slice(before);
			return result;
		},
	};
	const service = new Proxy(
		{},
		{
			get: (_target, name: string) => async () => {
				calls.push(name);
				return {};
			},
		}
	) as unknown as IIdentityService;
	return { engine: new VeramoEngine(service, payerLock), locks, calls };
}

describe('Veramo ledger writes take the payer lock', () => {
	const writes: [string, (e: VeramoEngine) => Promise<unknown>, string][] = [
		['createDid', (e) => e.createDid('testnet', { id: did }, customer), 'testnet'],
		['updateDid', (e) => e.updateDid({ id: did }, customer), 'testnet'],
		['deactivateDid', (e) => e.deactivateDid(did, customer), 'testnet'],
		['createResource', (e) => e.createResource('mainnet', {} as never, customer), 'mainnet'],
		[
			'createUnencryptedStatusList2021',
			(e) => e.createUnencryptedStatusList2021(did, {} as never, {} as never, customer),
			'testnet',
		],
		[
			'createUnencryptedBitstringStatusList',
			(e) => e.createUnencryptedBitstringStatusList(did, {} as never, {} as never, customer),
			'testnet',
		],
		[
			'createEncryptedStatusList2021',
			(e) => e.createEncryptedStatusList2021(did, {} as never, {} as never, customer),
			'testnet',
		],
		[
			'createEncryptedBitstringStatusList',
			(e) => e.createEncryptedBitstringStatusList(did, {} as never, {} as never, customer),
			'testnet',
		],
		[
			'updateUnencryptedStatusList',
			(e) => e.updateUnencryptedStatusList(did, 'x', {} as never, customer),
			'testnet',
		],
		['updateEncryptedStatusList', (e) => e.updateEncryptedStatusList(did, 'x', {} as never, customer), 'testnet'],
		[
			'broadcastStatusList2021',
			(e) => e.broadcastStatusList2021(did, {} as never, {} as never, customer),
			'testnet',
		],
		['broadcastBitstringStatusList', (e) => e.broadcastBitstringStatusList(did, {} as never, customer), 'testnet'],
		[
			'remunerateStatusList2021',
			(e) => e.remunerateStatusList2021({ feePaymentNetwork: 'mainnet' } as never, customer),
			'mainnet',
		],
		['revokeCredentials', (e) => e.revokeCredentials(credential as never, 'x', true, customer, ''), 'testnet'],
		['suspendCredentials', (e) => e.suspendCredentials(credential as never, 'x', true, customer, ''), 'testnet'],
		[
			'reinstateCredentials',
			(e) => e.reinstateCredentials(credential as never, 'x', true, customer, ''),
			'testnet',
		],
	];

	it.each(writes)('%s runs inside the lock for the right network', async (name, call, network) => {
		const { engine, locks } = setup();
		await call(engine);
		expect(locks).toHaveLength(1);
		expect(locks[0].network).toBe(network);
		expect(locks[0].during).toEqual([name]);
	});

	it.each([
		[
			'revoke without publishing',
			(e: VeramoEngine) => e.revokeCredentials(credential as never, 'x', false, customer, ''),
		],
		['key creation', (e: VeramoEngine) => e.createKey('Ed25519', customer)],
		['resolve', (e: VeramoEngine) => e.resolveDid(did)],
		['status list check', (e: VeramoEngine) => e.checkBitstringStatusList(did, {} as never, customer)],
		['credential issue', (e: VeramoEngine) => e.createCredential({} as never, 'jwt', null, customer)],
	])('%s does not take it', async (_name, call) => {
		const { engine, locks, calls } = setup();
		await call(engine);
		expect(locks).toHaveLength(0);
		expect(calls).toHaveLength(1);
	});

	it('is a pass-through when no lock is supplied', async () => {
		const service = { createDid: jest.fn(async () => ({ did })) } as unknown as IIdentityService;
		expect(await new VeramoEngine(service).createDid('testnet', { id: did }, customer)).toEqual({ did });
	});
});

describe('createVeramoPayerLock', () => {
	const sqlite: LockDataSource = {
		options: { type: 'sqlite' },
		transaction: async (work) => work({ query: async () => [] }),
	};

	it('serialises two writes on one payer address, whichever engine they come from', async () => {
		const lock = createVeramoPayerLock({
			resolveAddress: async () => 'cheqd1payer',
			withPayerLock,
			lockSource: sqlite,
		});
		let inside = 0;
		let overlap = 0;
		const order: number[] = [];
		const write = (i: number) =>
			lock.run(customer, 'testnet', async () => {
				inside++;
				overlap = Math.max(overlap, inside);
				order.push(i);
				await new Promise((resolve) => setTimeout(resolve, 10));
				inside--;
			});
		// A Credo write on the same address uses the same function, so it joins the same queue
		const credoLike = withPayerLock(sqlite, 'cheqd1payer', async () => {
			inside++;
			overlap = Math.max(overlap, inside);
			order.push(99);
			await new Promise((resolve) => setTimeout(resolve, 10));
			inside--;
		});
		await Promise.all([write(1), write(2), credoLike, write(3)]);
		expect(overlap).toBe(1);
		expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 99]);
	});

	it('runs unlocked when there is no customer, no network or no payment account', async () => {
		const spy = jest.fn(withPayerLock) as unknown as typeof withPayerLock;
		const lock = createVeramoPayerLock({
			resolveAddress: async () => undefined,
			withPayerLock: spy,
			lockSource: sqlite,
		});
		expect(await lock.run(customer, 'testnet', async () => 'a')).toBe('a');
		expect(await lock.run(undefined, 'testnet', async () => 'b')).toBe('b');
		expect(await lock.run(customer, undefined, async () => 'c')).toBe('c');
		expect(spy as never).not.toHaveBeenCalled();
	});

	it('does not swallow the write error, and frees the queue', async () => {
		const lock = createVeramoPayerLock({
			resolveAddress: async () => 'cheqd1p2',
			withPayerLock,
			lockSource: sqlite,
		});
		await expect(lock.run(customer, 'testnet', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
			'boom'
		);
		expect(await lock.run(customer, 'testnet', async () => 'next')).toBe('next');
	});
});

describe('network helpers', () => {
	it('read the network from cheqd DIDs and credentials only', () => {
		expect(networkOfDid(did)).toBe('testnet');
		expect(networkOfDid('did:key:z6Mk')).toBeUndefined();
		expect(networkOfDid(undefined)).toBeUndefined();
		expect(networkOfCredential(credential)).toBe('testnet');
		expect(networkOfCredential({ issuer: did })).toBeUndefined();
	});
});
