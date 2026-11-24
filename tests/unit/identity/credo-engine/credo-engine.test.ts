import { beforeEach, describe, expect, it } from '@jest/globals';
import { bases } from 'multiformats/basics';
import { CredoEngine } from '../../../../src/services/identity/engine/credo/credo-engine.js';
import { CredoTenantMissingError } from '../../../../src/services/identity/engine/credo/errors.js';
import { deactivationGasLimit } from '../../../../src/services/identity/engine/deactivation-gas.js';
import type { EngineDidDocument } from '../../../../src/services/identity/engine/types.js';
import { customer, FakeRuntime, FakeStore } from './fakes.js';

const alice = customer('alice');
const bob = customer('bob');
const DID_NS = 'did:cheqd:testnet:';

interface Harness {
	engine: CredoEngine;
	store: FakeStore;
	runtime: FakeRuntime;
	locked: string[];
	events: string[];
}

function harness(): Harness {
	const store = new FakeStore();
	const runtime = new FakeRuntime();
	const locked: string[] = [];
	const events = runtime.events;
	const engine = new CredoEngine({
		store,
		runtime,
		withPayerLock: async (address, work) => {
			locked.push(address);
			events.push(`lock:${address}`);
			try {
				return await work();
			} finally {
				events.push(`unlock:${address}`);
			}
		},
	});
	store.addPayer('alice', 'testnet');
	store.addPayer('bob', 'testnet');
	return { engine, store, runtime, locked, events };
}

const base58 = (hex: string) => bases.base58btc.encode(new Uint8Array(Buffer.from(hex, 'hex'))).slice(1);
const multibaseEd25519 = (hex: string) =>
	bases.base58btc.encode(new Uint8Array([0xed, 0x01, ...Buffer.from(hex, 'hex')]));

/** A document in each of the shapes the public API accepts, signed by one Ed25519 key. */
function documentFor(
	did: string,
	publicKeyHex: string,
	type: 'Ed25519VerificationKey2018' | 'Ed25519VerificationKey2020' | 'JsonWebKey2020'
): EngineDidDocument {
	const id = `${did}#key-1`;
	const method =
		type === 'Ed25519VerificationKey2018'
			? { id, type, controller: did, publicKeyBase58: base58(publicKeyHex) }
			: type === 'Ed25519VerificationKey2020'
				? { id, type, controller: did, publicKeyMultibase: multibaseEd25519(publicKeyHex) }
				: {
						id,
						type,
						controller: did,
						publicKeyJwk: {
							kty: 'OKP',
							crv: 'Ed25519',
							x: Buffer.from(publicKeyHex, 'hex').toString('base64url'),
						},
					};
	return { id: did, verificationMethod: [method], authentication: [id], assertionMethod: [id] };
}

async function aliceKey(h: Harness) {
	return h.engine.createKey('Ed25519', alice, 'main');
}

describe('tenant lifecycle', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('creates no tenant until the customer first needs one', () => {
		expect(h.runtime.tenants).toHaveLength(0);
		expect(h.store.tenants.size).toBe(0);
	});

	it('creates the tenant on first use and records it against the customer', async () => {
		await aliceKey(h);
		expect(h.runtime.tenants).toHaveLength(1);
		expect(h.store.tenants.get('alice')).toBe(h.runtime.tenants[0]);
		// The label is the customer id, not a name or an email
		expect(h.events[0]).toBe('createTenant:studio-customer:alice');
	});

	it('reuses the tenant on later calls', async () => {
		await aliceKey(h);
		await aliceKey(h);
		expect(h.runtime.tenants).toHaveLength(1);
	});

	it('gives each customer a tenant of their own', async () => {
		await aliceKey(h);
		await h.engine.createKey('Ed25519', bob);
		expect(h.runtime.tenants).toHaveLength(2);
		expect(h.store.tenants.get('alice')).not.toBe(h.store.tenants.get('bob'));
	});

	it('creates exactly one tenant when the first calls race', async () => {
		await Promise.all([
			h.engine.ensureTenant('alice'),
			h.engine.ensureTenant('alice'),
			h.engine.ensureTenant('alice'),
		]);
		expect(h.runtime.tenants).toHaveLength(1);
	});

	it('deletes the tenant it just made when recording it fails, so none is orphaned', async () => {
		h.store.failTenantWrite = true;
		await expect(h.engine.ensureTenant('alice')).rejects.toThrow('write failed');
		expect(h.runtime.deleted).toEqual(h.runtime.tenants);
	});

	describe('a recorded tenant that is missing from the Askar store', () => {
		const missing = (tenantId: string) => new Error(`TenantRecord: record with id ${tenantId} not found.`);

		it('fails with credo_tenant_missing, creates nothing, and leaves the record alone', async () => {
			h.store.tenants.set('alice', 'tenant-gone');
			h.runtime.withTenant = async (tenantId) => {
				throw missing(tenantId);
			};
			const error = await h.engine.createKey('Ed25519', alice).catch((e) => e);
			expect(error).toBeInstanceOf(CredoTenantMissingError);
			expect(error).toMatchObject({ status: 500, code: 'credo_tenant_missing', tenantId: 'tenant-gone' });
			expect(error.message).not.toContain('tenant-gone');
			expect(h.runtime.tenants).toHaveLength(0);
			expect(h.store.tenants.get('alice')).toBe('tenant-gone');
		});

		it('does not rewrite any other error, or a missing record of another tenant', async () => {
			h.store.tenants.set('alice', 'tenant-a');
			h.runtime.withTenant = async () => {
				throw missing('tenant-other');
			};
			await expect(h.engine.createKey('Ed25519', alice)).rejects.toThrow('tenant-other');
			h.runtime.withTenant = async () => {
				throw new Error('boom');
			};
			await expect(h.engine.createKey('Ed25519', alice)).rejects.toThrow('boom');
		});
	});
});

describe('keys', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('createKey imports into the KMS under the Veramo-style kid and records it as the customer’s', async () => {
		const key = await h.engine.createKey('Secp256r1', alice, 'signing');
		expect(key.kid).toBe(key.publicKeyHex);
		expect(key.publicKeyHex).toMatch(/^0[23][0-9a-f]{64}$/); // compressed P-256 point
		expect(h.runtime.imported).toHaveLength(1);
		expect(h.runtime.imported[0].keyId).toBe(key.kid);
		expect(h.store.keys[0].customerId).toBe('alice');
	});

	it.each(['Ed25519', 'Secp256k1', 'X25519'])('createKey supports %s', async (type) => {
		const key = await h.engine.createKey(type, alice);
		expect(key.type).toBe(type);
	});

	it('refuses an unknown key type and a missing customer', async () => {
		await expect(h.engine.createKey('RSA', alice)).rejects.toThrow('Unsupported key type');
		await expect(h.engine.createKey('Ed25519', undefined)).rejects.toThrow('Customer not found');
	});

	it('getKey returns the customer’s key and null for anything else', async () => {
		const key = await aliceKey(h);
		expect((await h.engine.getKey(key.kid, alice))?.kid).toBe(key.kid);
		expect(await h.engine.getKey(key.kid, bob)).toBeNull();
		expect(await h.engine.getKey('no-such-kid', alice)).toBeNull();
		expect(await h.engine.getKey(key.kid, undefined)).toBeNull();
	});
});

describe('deleteUnusedKey', () => {
	it('removes an unused key of the customer, in Studio and in the KMS', async () => {
		const h = harness();
		const key = await h.engine.createKey('Ed25519', alice);
		expect(await h.engine.deleteUnusedKey(key.kid, alice)).toBe(true);
		expect(h.store.keys).toHaveLength(0);
		expect(h.runtime.deletedKeys).toEqual([{ tenantId: h.store.tenants.get('alice'), keyId: key.kid }]);
	});

	it('leaves another customer’s key, and an unknown key, alone', async () => {
		const h = harness();
		const key = await h.engine.createKey('Ed25519', alice);
		expect(await h.engine.deleteUnusedKey(key.kid, bob)).toBe(false);
		expect(await h.engine.deleteUnusedKey('nope', alice)).toBe(false);
		expect(h.store.keys).toHaveLength(1);
		expect(h.runtime.deletedKeys).toHaveLength(0);
	});

	it('leaves a key that a DID uses', async () => {
		const h = harness();
		const key = await h.engine.createKey('Ed25519', alice);
		h.store.identifiers.push({
			customerId: 'alice',
			did: 'did:cheqd:testnet:x',
			provider: 'did:cheqd:testnet',
			keyIds: [key.kid],
			services: [],
		});
		expect(await h.engine.deleteUnusedKey(key.kid, alice)).toBe(false);
		expect(h.store.keys).toHaveLength(1);
	});
});

describe('createDid', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it.each(['Ed25519VerificationKey2018', 'Ed25519VerificationKey2020', 'JsonWebKey2020'] as const)(
		'accepts an existing key in a %s verification method and signs with it',
		async (type) => {
			const key = await aliceKey(h);
			const did = `${DID_NS}0b6a4c1e-0000-4000-8000-000000000001`;
			const identifier = await h.engine.createDid('testnet', documentFor(did, key.publicKeyHex, type), alice);

			const call = h.runtime.calls.find((c) => c.method === 'createDid');
			expect(call?.args[0]).toMatchObject({
				network: 'testnet',
				keys: [{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: key.kid }],
			});
			expect(identifier.did).toBe(did);
			expect(identifier.provider).toBe('did:cheqd:testnet');
			expect(identifier.controllerKeyId).toBe(key.kid);
			expect(await h.engine.didExists(did, alice)).toBe(true);
		}
	);

	it('creates the default identifier: a P-256 JsonWebKey and an Ed25519 Multikey, both new keys of the customer', async () => {
		const identifier = await h.engine.createDid('testnet', { id: '' }, alice);
		const call = h.runtime.calls.find((c) => c.method === 'createDid');
		const input = call?.args[0] as {
			didDocument: EngineDidDocument;
			keys: { didDocumentRelativeKeyId: string; kmsKeyId: string }[];
		};

		const [jwk, multikey] = input.didDocument.verificationMethod as Record<string, unknown>[];
		expect(jwk.type).toBe('JsonWebKey2020');
		expect(jwk.publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
		expect((jwk.publicKeyJwk as Record<string, unknown>).d).toBeUndefined(); // never the private part
		expect(multikey.type).toBe('Ed25519VerificationKey2020');
		expect(String(multikey.publicKeyMultibase).startsWith('z6Mk')).toBe(true);
		expect(input.didDocument.authentication).toEqual([
			`${input.didDocument.id}#key-1`,
			`${input.didDocument.id}#key-2`,
		]);
		expect(input.didDocument.id.startsWith(DID_NS)).toBe(true);

		expect(input.keys.map((k) => k.didDocumentRelativeKeyId)).toEqual(['#key-1', '#key-2']);
		expect(h.store.keys.map((k) => [k.type, k.customerId])).toEqual([
			['Secp256r1', 'alice'],
			['Ed25519', 'alice'],
		]);
		expect(identifier.controllerKeyId).toBe(input.keys[0].kmsKeyId); // P-256 is the default signing key
	});

	it('takes the payer lock before the ledger call and releases it after', async () => {
		const key = await aliceKey(h);
		h.events.length = 0;
		await h.engine.createDid(
			'testnet',
			documentFor(`${DID_NS}a`, key.publicKeyHex, 'Ed25519VerificationKey2018'),
			alice
		);
		const order = h.events.filter((e) => e === 'createDid' || e.startsWith('lock:') || e.startsWith('unlock:'));
		expect(order).toEqual(['lock:cheqd1alicetestnet', 'createDid', 'unlock:cheqd1alicetestnet']);
	});

	it('fails with the registrar’s reason, writes no identifier, and still releases the lock', async () => {
		h.runtime.createState = { state: 'failed', reason: 'ledgerError: insufficient funds' };
		const key = await aliceKey(h);
		await expect(
			h.engine.createDid(
				'testnet',
				documentFor(`${DID_NS}b`, key.publicKeyHex, 'Ed25519VerificationKey2018'),
				alice
			)
		).rejects.toThrow('insufficient funds');
		expect(h.store.identifiers).toHaveLength(0);
		expect(h.events).toContain('unlock:cheqd1alicetestnet');
	});

	it('refuses, before creating anything, when the customer has no payment account on the network', async () => {
		const carol = customer('carol');
		await expect(h.engine.createDid('testnet', { id: '' }, carol)).rejects.toThrow('no fee payer');
		expect(h.runtime.tenants).toHaveLength(0);
		expect(h.runtime.calls).toHaveLength(0);
	});

	it('refuses a document on another network, and an unknown network', async () => {
		await expect(h.engine.createDid('testnet', { id: 'did:cheqd:mainnet:x' }, alice)).rejects.toThrow(
			'not on testnet'
		);
		await expect(h.engine.createDid('devnet', { id: '' }, alice)).rejects.toThrow('Unsupported network');
	});

	it('refuses a document whose authentication method has no usable public key', async () => {
		const doc = {
			id: `${DID_NS}c`,
			verificationMethod: [
				{ id: `${DID_NS}c#key-1`, type: 'Ed25519VerificationKey2018', controller: `${DID_NS}c` },
			],
			authentication: [`${DID_NS}c#key-1`],
		};
		await expect(h.engine.createDid('testnet', doc, alice)).rejects.toThrow('no usable public key');
	});
});

describe('ownership: a second customer cannot use the first customer’s key or DID', () => {
	let h: Harness;
	let aliceDid: string;
	let alicePublicKey: string;

	beforeEach(async () => {
		h = harness();
		const key = await aliceKey(h);
		alicePublicKey = key.publicKeyHex;
		aliceDid = `${DID_NS}alice-did`;
		await h.engine.createDid(
			'testnet',
			documentFor(aliceDid, key.publicKeyHex, 'Ed25519VerificationKey2018'),
			alice
		);
		h.runtime.calls.length = 0;
	});

	const ledgerCalls = (h: Harness) => h.runtime.calls.filter((c) => c.method !== 'importKey');

	it('bob cannot create a DID signed by alice’s key (any verification method type)', async () => {
		for (const type of ['Ed25519VerificationKey2018', 'Ed25519VerificationKey2020', 'JsonWebKey2020'] as const) {
			await expect(
				h.engine.createDid('testnet', documentFor(`${DID_NS}bob-${type}`, alicePublicKey, type), bob)
			).rejects.toThrow(`Key ${alicePublicKey} not found in wallet`);
		}
		expect(ledgerCalls(h)).toHaveLength(0);
		expect(h.locked).toHaveLength(1); // only alice’s earlier creation
	});

	it('bob cannot read alice’s key', async () => {
		expect(await h.engine.getKey(alicePublicKey, bob)).toBeNull();
	});

	it('bob cannot update alice’s DID, even with a key of his own', async () => {
		const bobKey = await h.engine.createKey('Ed25519', bob);
		await expect(
			h.engine.updateDid(documentFor(aliceDid, bobKey.publicKeyHex, 'Ed25519VerificationKey2018'), bob)
		).rejects.toThrow(`${aliceDid} not found in wallet`);
		expect(ledgerCalls(h)).toHaveLength(0);
	});

	it('bob cannot name alice’s public key in publicKeyHexs', async () => {
		const bobKey = await h.engine.createKey('Ed25519', bob);
		const bobDid = `${DID_NS}bob-did`;
		await h.engine.createDid(
			'testnet',
			documentFor(bobDid, bobKey.publicKeyHex, 'Ed25519VerificationKey2018'),
			bob
		);
		h.runtime.calls.length = 0;
		await expect(
			h.engine.updateDid(documentFor(bobDid, bobKey.publicKeyHex, 'Ed25519VerificationKey2018'), bob, [
				alicePublicKey,
			])
		).rejects.toThrow(`Key ${alicePublicKey} not found in wallet`);
		await expect(h.engine.deactivateDid(bobDid, bob, [alicePublicKey])).rejects.toThrow('not found in wallet');
		expect(ledgerCalls(h)).toHaveLength(0);
	});

	it('bob cannot deactivate alice’s DID or write a resource to it', async () => {
		await expect(h.engine.deactivateDid(aliceDid, bob)).rejects.toThrow('not found in wallet');
		await expect(
			h.engine.createResource(
				'testnet',
				{ collectionId: 'alice-did', name: 'n', resourceType: 't', data: 'x' },
				bob
			)
		).rejects.toThrow('not found in wallet');
		expect(ledgerCalls(h)).toHaveLength(0);
	});

	it('bob cannot see alice’s DID by any read', async () => {
		expect(await h.engine.didExists(aliceDid, bob)).toBe(false);
		await expect(h.engine.getDid(aliceDid, bob)).rejects.toThrow('not found');
		expect((await h.engine.listDids({}, bob)).dids).toEqual([]);
		expect((await h.engine.listDids({}, alice)).dids).toEqual([aliceDid]);
	});

	it('refuses to sign when the tenant’s own record of the DID names a key the customer does not own', async () => {
		// Simulates corrupt or tampered tenant state: the record points at another customer’s key
		const tenantId = h.store.tenants.get('alice') as string;
		h.runtime.recorded.set(`${tenantId}|${aliceDid}`, ['a-key-that-belongs-to-bob']);
		await expect(h.engine.deactivateDid(aliceDid, alice)).rejects.toThrow(
			'Key a-key-that-belongs-to-bob not found'
		);
		await expect(
			h.engine.updateDid(documentFor(aliceDid, alicePublicKey, 'Ed25519VerificationKey2018'), alice)
		).rejects.toThrow('not found in wallet');
		expect(ledgerCalls(h)).toHaveLength(0);
	});

	it('refuses a DID the tenant never created', async () => {
		const tenantId = h.store.tenants.get('alice') as string;
		h.runtime.recorded.delete(`${tenantId}|${aliceDid}`);
		await expect(h.engine.deactivateDid(aliceDid, alice)).rejects.toThrow(`${aliceDid} not found in wallet`);
	});

	it('a store that answered “found” from an empty result would be caught: ownership is decided by count', async () => {
		// The bug class in plan section 7.1: `find()` returned `[]` or `[rows, count]`, both truthy.
		// Here the store reports exactly one owner; any other customer must get false, not a truthy empty value.
		for (const who of ['bob', 'carol', '']) {
			expect(await h.store.isDidOwned(who, aliceDid)).toBe(false);
			expect(await h.store.findOwnedKey(who, { publicKeyHex: alicePublicKey })).toBeNull();
		}
	});

	it('the store refuses to re-home a key or DID that already belongs to alice', async () => {
		await expect(
			h.store.insertOwnedKey('bob', { kid: alicePublicKey, type: 'Ed25519', publicKeyHex: alicePublicKey })
		).rejects.toThrow('not found in wallet');
		await expect(
			h.store.saveIdentifier('bob', { did: aliceDid, provider: 'did:cheqd:testnet', keyIds: [], services: [] })
		).rejects.toThrow('not found in wallet');
	});
});

describe('updateDid, deactivateDid, createResource (own DID)', () => {
	let h: Harness;
	let did: string;
	let publicKeyHex: string;

	beforeEach(async () => {
		h = harness();
		const key = await aliceKey(h);
		publicKeyHex = key.publicKeyHex;
		did = `${DID_NS}own-did`;
		await h.engine.createDid('testnet', documentFor(did, publicKeyHex, 'Ed25519VerificationKey2018'), alice);
		h.runtime.calls.length = 0;
		h.events.length = 0;
	});

	it('updateDid links the signing keys, holds the lock and returns the identifier', async () => {
		const doc = {
			...documentFor(did, publicKeyHex, 'Ed25519VerificationKey2018'),
			service: [{ id: `${did}#s`, type: 'T', serviceEndpoint: 'https://example.com' }],
		};
		const identifier = await h.engine.updateDid(doc, alice, [publicKeyHex]);
		const call = h.runtime.calls.find((c) => c.method === 'updateDid');
		expect(call?.args[0]).toMatchObject({
			did,
			keys: [{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: publicKeyHex }],
		});
		expect(h.events.filter((e) => e !== 'importKey')).toEqual([
			'lock:cheqd1alicetestnet',
			'updateDid',
			'unlock:cheqd1alicetestnet',
		]);
		expect(identifier.did).toBe(did);
		expect(h.store.identifiers[0].services).toHaveLength(1);
	});

	it('updateDid also links an owned key that signs an authentication entry the update removes', async () => {
		const second = await h.engine.createKey('Ed25519', alice);
		h.runtime.resolution = {
			didDocument: {
				id: did,
				verificationMethod: [
					{
						id: `${did}#key-1`,
						type: 'Ed25519VerificationKey2018',
						controller: did,
						publicKeyBase58: base58(publicKeyHex),
					},
					{
						id: `${did}#key-2`,
						type: 'Ed25519VerificationKey2018',
						controller: did,
						publicKeyBase58: base58(second.publicKeyHex),
					},
				],
				authentication: [`${did}#key-1`, `${did}#key-2`],
			},
			didDocumentMetadata: {},
			didResolutionMetadata: {},
		};
		await h.engine.updateDid(documentFor(did, publicKeyHex, 'Ed25519VerificationKey2018'), alice);
		const keys = (
			h.runtime.calls.find((c) => c.method === 'updateDid')?.args[0] as { keys: { kmsKeyId: string }[] }
		).keys;
		expect(keys.map((k) => k.kmsKeyId).sort()).toEqual([publicKeyHex, second.publicKeyHex].sort());
	});

	it('updateDid surfaces the registrar’s failure reason', async () => {
		h.runtime.updateState = { state: 'failed', reason: 'payerError: no payer' };
		await expect(
			h.engine.updateDid(documentFor(did, publicKeyHex, 'Ed25519VerificationKey2018'), alice)
		).rejects.toThrow('payerError: no payer');
	});

	it('deactivateDid deactivates under the lock', async () => {
		h.runtime.resolution = { didDocument: { id: did }, didDocumentMetadata: {}, didResolutionMetadata: {} };
		expect(await h.engine.deactivateDid(did, alice)).toBe(true);
		expect(h.events.filter((e) => e !== 'importKey')).toEqual([
			'lock:cheqd1alicetestnet',
			'deactivateDid',
			'unlock:cheqd1alicetestnet',
		]);
	});

	it('deactivateDid sends a gas limit that grows with the DID’s versions (U-62)', async () => {
		const didDocument = {
			id: did,
			service: [1, 2, 3, 4].map((i) => ({
				id: `${did}#s${i}`,
				type: 'T',
				serviceEndpoint: 'https://example.com',
			})),
		};
		h.runtime.resolution = { didDocument, didDocumentMetadata: {}, didResolutionMetadata: {} };
		h.runtime.versionCounts.set(did, 4);
		await h.engine.deactivateDid(did, alice);
		const call = h.runtime.calls.find((c) => c.method === 'deactivateDid');
		expect(call?.args).toEqual([did, { gasLimit: deactivationGasLimit({ didDocument, versionCount: 4 }) }]);
		expect(Number((call?.args[1] as { gasLimit: string }).gasLimit)).toBeGreaterThan(360_226);
	});

	it('deactivateDid still sends a raised gas limit when the version count cannot be read', async () => {
		h.runtime.resolution = { didDocument: { id: did }, didDocumentMetadata: {}, didResolutionMetadata: {} };
		await h.engine.deactivateDid(did, alice);
		const call = h.runtime.calls.find((c) => c.method === 'deactivateDid');
		expect(call?.args[1]).toEqual({ gasLimit: deactivationGasLimit({ didDocument: { id: did } }) });
		expect(Number((call?.args[1] as { gasLimit: string }).gasLimit)).toBeGreaterThan(360_000);
	});

	it('deactivateDid on an already deactivated DID answers true without touching the ledger', async () => {
		h.runtime.resolution = {
			didDocument: { id: did },
			didDocumentMetadata: { deactivated: true },
			didResolutionMetadata: {},
		};
		expect(await h.engine.deactivateDid(did, alice)).toBe(true);
		expect(h.runtime.calls.some((c) => c.method === 'deactivateDid')).toBe(false);
		expect(h.events.some((e) => e.startsWith('lock:'))).toBe(false);
	});

	it('deactivateDid fails when the DID cannot be resolved, or the registrar fails', async () => {
		await expect(h.engine.deactivateDid(did, alice)).rejects.toThrow('DID document not found');
		h.runtime.resolution = { didDocument: { id: did }, didDocumentMetadata: {}, didResolutionMetadata: {} };
		h.runtime.deactivateState = { state: 'failed', reason: 'ledgerError: boom' };
		await expect(h.engine.deactivateDid(did, alice)).rejects.toThrow('ledgerError: boom');
	});

	it('createResource writes under the lock and answers true', async () => {
		const collectionId = did.split(':')[3];
		const data = new Uint8Array([1, 2, 3]);
		expect(
			await h.engine.createResource(
				'testnet',
				{ collectionId, id: 'r1', name: 'n', resourceType: 't', version: '1', data },
				alice
			)
		).toBe(true);
		expect(h.runtime.calls.find((c) => c.method === 'createResource')?.args).toEqual([
			did,
			expect.objectContaining({ id: 'r1', name: 'n', data }),
		]);
		expect(h.events.filter((e) => e !== 'importKey')).toEqual([
			'lock:cheqd1alicetestnet',
			'createResource',
			'unlock:cheqd1alicetestnet',
		]);
	});

	it('createResource surfaces the failure reason', async () => {
		h.runtime.resourceState = { state: 'failed', reason: 'ledgerError: nope' };
		await expect(
			h.engine.createResource(
				'testnet',
				{ collectionId: did.split(':')[3], name: 'n', resourceType: 't', data: 'x' },
				alice
			)
		).rejects.toThrow('ledgerError: nope');
	});
});

describe('methods another agent will build', () => {
	const methods = ['broadcastStatusList2021', 'broadcastBitstringStatusList', 'remunerateStatusList2021'];

	it.each(methods)('%s rejects with NotImplementedByEngine naming the method', async (method) => {
		const { engine } = harness();
		const call = (engine as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method].bind(engine);
		const error = await call(alice).catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).name).toBe('NotImplementedByEngine');
		expect((error as Error).message).toContain(`${method}()`);
	});

	it('every IdentityEngine method is either built or in this list', () => {
		const { engine } = harness();
		const built = [
			'createKey',
			'deleteUnusedKey',
			// import and export (tests in import-export.test.ts)
			'importKey',
			'importDid',
			'exportDid',
			'getKey',
			'createDid',
			'updateDid',
			'deactivateDid',
			'listDids',
			'getDid',
			'didExists',
			'resolveDid',
			'resolve',
			'createResource',
			'listResources',
			'ensureTenant',
			'createCredential',
			'verifyCredential',
			'createPresentation',
			'verifyPresentation',
			'listCredentials',
			'getCredential',
			'saveCredential',
			'retrieveCredential',
			'deleteCredential',
			'signWithDidKey',
			// accreditations (credo/accreditation.ts)
			'findLatestResourcesVersionsByType',
			'verifyAccreditation',
			// status lists (credo/status-lists.ts)
			'createUnencryptedStatusList2021',
			'createUnencryptedBitstringStatusList',
			'createEncryptedStatusList2021',
			'createEncryptedBitstringStatusList',
			'updateUnencryptedStatusList',
			'updateEncryptedStatusList',
			'checkStatusList2021',
			'checkBitstringStatusList',
			'searchStatusList',
			'revokeCredentials',
			'suspendCredentials',
			'reinstateCredentials',
			'createTokenStatusList',
			'setTokenStatus',
			'getTokenStatus',
		];
		const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(engine)).filter(
			(name) =>
				name !== 'constructor' &&
				![
					'notImplemented',
					'payerFor',
					'assertPublicKeysOwned',
					'linkSigningKeys',
					'assertRecordedKeysOwned',
					'storeImportedKey',
				].includes(name)
		);
		expect(proto.sort()).toEqual([...built, ...methods].sort());
	});
});

describe('resolution', () => {
	it('resolveDid delegates to the runtime and resolve fetches the resolver', async () => {
		const h = harness();
		h.runtime.resolution = {
			didDocument: { id: 'did:cheqd:testnet:x' },
			didDocumentMetadata: {},
			didResolutionMetadata: {},
		};
		expect((await h.engine.resolveDid('did:cheqd:testnet:x')).didDocument?.id).toBe('did:cheqd:testnet:x');

		const seen: string[] = [];
		const engine = new CredoEngine({
			store: h.store,
			runtime: h.runtime,
			withPayerLock: (_a, w) => w(),
			resolverUrl: 'https://resolver.example/1.0/identifiers',
			fetch: (async (url: string) => {
				seen.push(url);
				return new Response('{}');
			}) as unknown as typeof fetch,
		});
		await engine.resolve('did:cheqd:testnet:x#key-1', true);
		expect(seen).toEqual(['https://resolver.example/1.0/identifiers/did:cheqd:testnet:x#key-1']);
	});
});
