import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { bases } from 'multiformats/basics';
import { CredoEngine } from '../../../../src/services/identity/engine/credo/credo-engine.js';
import { CredoNotSupportedError, CredoOwnershipError } from '../../../../src/services/identity/engine/credo/errors.js';
import { decryptKeyExport, encryptKeyExport } from '../../../../src/helpers/key-export.js';
import type { EngineDidDocument } from '../../../../src/services/identity/engine/types.js';
import { customer, FakeRuntime, FakeStore } from './fakes.js';

const alice = customer('alice');
const bob = customer('bob');
const DID = 'did:cheqd:testnet:6f1e5c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

interface Harness {
	engine: CredoEngine;
	store: FakeStore;
	runtime: FakeRuntime;
}

function harness(): Harness {
	const store = new FakeStore();
	const runtime = new FakeRuntime(store.keyMaterial);
	const engine = new CredoEngine({ store, runtime, withPayerLock: async (_address, work) => work() });
	store.addPayer('alice', 'testnet');
	store.addPayer('bob', 'testnet');
	return { engine, store, runtime };
}

// ----------------------------------------------------------------- test keys, generated here, never fixed

const hex = (b64u: string) => Buffer.from(b64u, 'base64url').toString('hex');

interface TestKey {
	type: 'Ed25519' | 'Secp256r1' | 'Secp256k1';
	/** What a customer sends: the 32-byte seed or secret */
	privateKeyHex: string;
	/** Studio's key id convention: raw Ed25519 public key, compressed EC point */
	publicKeyHex: string;
	jwk: { kty: string; crv: string; x: string; y?: string };
}

function ed25519(): TestKey & { seedAndPublicHex: string } {
	const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }) as Record<string, string>;
	return {
		type: 'Ed25519',
		privateKeyHex: hex(jwk.d),
		seedAndPublicHex: hex(jwk.d) + hex(jwk.x),
		publicKeyHex: hex(jwk.x),
		jwk: { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
	};
}

function ec(type: 'Secp256r1' | 'Secp256k1'): TestKey {
	const curve = type === 'Secp256r1' ? 'prime256v1' : 'secp256k1';
	const jwk = generateKeyPairSync('ec', { namedCurve: curve }).privateKey.export({ format: 'jwk' }) as Record<
		string,
		string
	>;
	const y = Buffer.from(jwk.y, 'base64url');
	return {
		type,
		privateKeyHex: hex(jwk.d),
		publicKeyHex: ((y[y.length - 1] & 1) === 0 ? '02' : '03') + hex(jwk.x),
		jwk: { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y },
	};
}

const multibaseEd25519 = (publicKeyHex: string) =>
	bases.base58btc.encode(new Uint8Array([0xed, 0x01, ...Buffer.from(publicKeyHex, 'hex')]));

/** A document signed by `signing` (in `authentication`), with `extra` as further verification methods only. */
function documentFor(did: string, signing: TestKey[], extra: TestKey[] = []): EngineDidDocument {
	const method = (key: TestKey, index: number) => {
		const id = `${did}#key-${index + 1}`;
		return key.type === 'Ed25519'
			? {
					id,
					type: 'Ed25519VerificationKey2020',
					controller: did,
					publicKeyMultibase: multibaseEd25519(key.publicKeyHex),
				}
			: { id, type: 'JsonWebKey2020', controller: did, publicKeyJwk: key.jwk };
	};
	const all = [...signing, ...extra].map(method);
	const signingIds = all.slice(0, signing.length).map((vm) => vm.id);
	return {
		id: did,
		controller: [did],
		verificationMethod: all,
		authentication: signingIds,
		assertionMethod: signingIds,
	};
}

function publish(h: Harness, document: EngineDidDocument, deactivated = false) {
	h.runtime.credentialState.resolutions.set(document.id, {
		didDocument: document,
		didDocumentMetadata: deactivated ? { deactivated: true } : {},
		didResolutionMetadata: {},
	});
}

const kmsImports = (h: Harness) => h.runtime.calls.filter((c) => c.method === 'importKey');
const nothingWritten = (h: Harness) => {
	expect(kmsImports(h)).toHaveLength(0);
	expect(h.runtime.calls.filter((c) => c.method === 'importDid')).toHaveLength(0);
	expect(h.store.keys).toHaveLength(0);
	expect(h.store.keyMaterial.size).toBe(0);
	expect(h.store.identifiers).toHaveLength(0);
};

// ------------------------------------------------------------------------------------------- importKey

describe('importKey', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('stores an Ed25519 seed in the key store (Veramo layout) and records it as the customer key', async () => {
		const key = ed25519();
		const result = await h.engine.importKey('Ed25519', key.privateKeyHex, alice, 'imported');

		expect(result).toMatchObject({
			kid: key.publicKeyHex,
			type: 'Ed25519',
			publicKeyHex: key.publicKeyHex,
			kms: 'postgres',
			publicKeyAlias: 'imported',
		});
		// The private key table holds the 64-byte seed-plus-public form Veramo writes, so both engines can sign
		expect(h.store.keyMaterial.get(key.publicKeyHex)).toEqual({
			type: 'Ed25519',
			privateKeyHex: key.seedAndPublicHex,
		});
		// Imported through alice's own tenant
		expect(kmsImports(h)).toEqual([
			{ tenantId: h.store.tenants.get('alice'), method: 'importKey', args: [key.publicKeyHex] },
		]);
		expect(await h.store.findOwnedKey('alice', { kid: key.publicKeyHex })).not.toBeNull();
		expect(await h.store.findOwnedKey('bob', { kid: key.publicKeyHex })).toBeNull();
	});

	it("accepts Veramo's 64-byte Ed25519 form and gives it the same key id", async () => {
		const key = ed25519();
		const result = await h.engine.importKey('Ed25519', key.seedAndPublicHex, alice);
		expect(result.kid).toBe(key.publicKeyHex);
		expect(h.store.keyMaterial.get(key.publicKeyHex)?.privateKeyHex).toBe(key.seedAndPublicHex);
	});

	it.each(['Secp256r1', 'Secp256k1'] as const)('imports a %s key under its compressed public key', async (type) => {
		const key = ec(type);
		const result = await h.engine.importKey(type, key.privateKeyHex, alice);
		expect(result).toMatchObject({ kid: key.publicKeyHex, type, publicKeyHex: key.publicKeyHex });
		expect(h.store.keyMaterial.get(key.publicKeyHex)).toEqual({ type, privateKeyHex: key.privateKeyHex });
	});

	it('importing a key the customer already holds changes only the alias', async () => {
		const key = ed25519();
		await h.engine.importKey('Ed25519', key.privateKeyHex, alice, 'first');
		const again = await h.engine.importKey('Ed25519', key.privateKeyHex, alice, 'second');
		expect(again.publicKeyAlias).toBe('second');
		expect(kmsImports(h)).toHaveLength(1);
		expect(h.store.keys).toHaveLength(1);
	});

	it("refuses a key another customer holds, with the not-found answer, and leaves bob's key alone", async () => {
		const key = ed25519();
		await h.engine.importKey('Ed25519', key.privateKeyHex, bob);
		const error = await h.engine.importKey('Ed25519', key.privateKeyHex, alice).catch((e: Error) => e);
		expect(error).toBeInstanceOf(CredoOwnershipError);
		expect((error as Error).message).toBe(`Key ${key.publicKeyHex} not found in wallet`);
		expect(h.store.keys.map((k) => k.customerId)).toEqual(['bob']);
	});

	it.each(['Bls12381G2', 'RSA', 'secp256r1'])('refuses the unsupported key type %s before writing', async (type) => {
		const error = await h.engine.importKey(type, ed25519().privateKeyHex, alice).catch((e: Error) => e);
		expect(error).toBeInstanceOf(CredoNotSupportedError);
		expect(h.runtime.tenants).toHaveLength(0);
		nothingWritten(h);
	});

	it('refuses malformed key material without quoting it', async () => {
		const key = ed25519();
		const inconsistent = key.privateKeyHex + ed25519().publicKeyHex; // seed with someone else's public key
		for (const [type, value] of [
			['Ed25519', 'zz'.repeat(32)],
			['Ed25519', key.privateKeyHex.slice(0, 40)],
			['Ed25519', inconsistent],
			['Secp256r1', '00'.repeat(32)],
			['Secp256k1', key.privateKeyHex + '00'],
		] as const) {
			const error = (await h.engine.importKey(type, value, alice).catch((e: Error) => e)) as Error;
			expect(error).toBeInstanceOf(Error);
			expect(error.message).not.toContain(value);
			expect(error.message).not.toContain(key.privateKeyHex);
		}
		nothingWritten(h);
	});
});

// ------------------------------------------------------------------------------------------- importDid

describe('importDid', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('stores the keys, records the DID in the tenant with keys linked by kid, and saves the identifier', async () => {
		const p256 = ec('Secp256r1');
		const edKey = ed25519();
		const document = documentFor(DID, [p256, edKey]);
		publish(h, document);

		const identifier = await h.engine.importDid(
			DID,
			[
				{ type: 'Secp256r1', privateKeyHex: p256.privateKeyHex },
				{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex },
			],
			undefined,
			alice
		);

		expect(identifier).toMatchObject({
			did: DID,
			provider: 'did:cheqd:testnet',
			controllerKeyId: p256.publicKeyHex,
		});
		expect(identifier.keys?.map((k) => k.kid)).toEqual([p256.publicKeyHex, edKey.publicKeyHex]);
		// No private material in the answer
		expect(JSON.stringify(identifier)).not.toContain(edKey.privateKeyHex);
		expect(JSON.stringify(identifier)).not.toContain(p256.privateKeyHex);

		const tenantId = h.store.tenants.get('alice');
		const imports = h.runtime.calls.filter((c) => c.method === 'importDid');
		expect(imports).toEqual([
			{
				tenantId,
				method: 'importDid',
				args: [
					{
						did: DID,
						didDocument: document,
						keys: [
							{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: p256.publicKeyHex },
							{ didDocumentRelativeKeyId: '#key-2', kmsKeyId: edKey.publicKeyHex },
						],
					},
				],
			},
		]);
		expect(h.store.keyMaterial.has(p256.publicKeyHex)).toBe(true);
		expect(h.store.keyMaterial.has(edKey.publicKeyHex)).toBe(true);
		expect(await h.store.isDidOwned('alice', DID)).toBe(true);
		// No ledger write for an import
		expect(h.runtime.calls.map((c) => c.method)).not.toContain('createDid');
	});

	it('leaves the DID usable by update, deactivate and resource creation through Credo', async () => {
		const edKey = ed25519();
		const document = documentFor(DID, [edKey]);
		publish(h, document);
		await h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice);

		await h.engine.updateDid({ ...document, service: [] }, alice);
		await h.engine.createResource(
			'testnet',
			{ collectionId: DID.split(':')[3], name: 'n', resourceType: 't', data: 'x' },
			alice
		);
		await h.engine.deactivateDid(DID, alice);
		expect(h.runtime.calls.map((c) => c.method)).toEqual(
			expect.arrayContaining(['updateDid', 'createResource', 'deactivateDid'])
		);
		const update = h.runtime.calls.find((c) => c.method === 'updateDid');
		expect((update?.args[0] as { keys: unknown }).keys).toEqual([
			{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: edKey.publicKeyHex },
		]);
	});

	it('also links further verification methods whose key is supplied, and keeps a linked controllerKeyId', async () => {
		const signing = ed25519();
		const extra = ec('Secp256r1');
		publish(h, documentFor(DID, [signing], [extra]));
		const identifier = await h.engine.importDid(
			DID,
			[
				{ type: 'Ed25519', privateKeyHex: signing.privateKeyHex },
				{ type: 'Secp256r1', privateKeyHex: extra.privateKeyHex },
			],
			extra.publicKeyHex,
			alice
		);
		expect(identifier.controllerKeyId).toBe(extra.publicKeyHex);
		expect(h.runtime.recorded.get(`${h.store.tenants.get('alice')}|${DID}`)).toEqual([
			signing.publicKeyHex,
			extra.publicKeyHex,
		]);
	});

	it('needs no keys for methods whose key the customer already holds', async () => {
		const edKey = ed25519();
		await h.engine.importKey('Ed25519', edKey.privateKeyHex, alice);
		publish(h, documentFor(DID, [edKey]));
		const identifier = await h.engine.importDid(DID, [], undefined, alice);
		expect(identifier.keys?.map((k) => k.kid)).toEqual([edKey.publicKeyHex]);
	});

	it('refuses a key that is not the key of any verification method, before writing anything', async () => {
		const edKey = ed25519();
		publish(h, documentFor(DID, [edKey]));
		const error = (await h.engine
			.importDid(
				DID,
				[
					{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex },
					{ type: 'Ed25519', privateKeyHex: ed25519().privateKeyHex },
				],
				undefined,
				alice
			)
			.catch((e: Error) => e)) as Error;
		expect(error.message).toBe(`Key 2 (Ed25519) is not the key of any verification method of ${DID}`);
		nothingWritten(h);
	});

	it('refuses when an authentication key is neither supplied nor held, before writing anything', async () => {
		const signing = ed25519();
		const other = ec('Secp256r1');
		publish(h, documentFor(DID, [signing, other]));
		await expect(
			h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: signing.privateKeyHex }], undefined, alice)
		).rejects.toThrow(`The keys must include the key of authentication method #key-2 of ${DID}`);
		nothingWritten(h);
	});

	it("refuses another customer's DID with the not-found answer and leaves bob's record alone", async () => {
		const edKey = ed25519();
		publish(h, documentFor(DID, [edKey]));
		await h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, bob);

		// alice holds the same private key, but the key row and the DID are bob's
		const error = (await h.engine
			.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice)
			.catch((e: Error) => e)) as Error;
		expect(error).toBeInstanceOf(CredoOwnershipError);
		expect(error.message).toBe(`Key ${edKey.publicKeyHex} not found in wallet`);
		expect(h.store.identifiers.map((i) => i.customerId)).toEqual(['bob']);
		expect(await h.store.isDidOwned('alice', DID)).toBe(false);
	});

	it("refuses another customer's DID even when the importer holds every key", async () => {
		// bob recorded the DID with keys of his own; alice has the DID's real key under her own row
		const edKey = ed25519();
		await h.engine.importKey('Ed25519', edKey.privateKeyHex, alice);
		h.store.identifiers.push({
			did: DID,
			provider: 'did:cheqd:testnet',
			keyIds: [],
			services: [],
			customerId: 'bob',
		});
		publish(h, documentFor(DID, [edKey]));
		await expect(h.engine.importDid(DID, [], undefined, alice)).rejects.toThrow(`${DID} not found in wallet`);
		expect(h.store.identifiers.map((i) => i.customerId)).toEqual(['bob']);
	});

	it('refuses an unsupported key type before writing anything', async () => {
		publish(h, documentFor(DID, [ed25519()]));
		await expect(
			h.engine.importDid(DID, [{ type: 'Bls12381G2', privateKeyHex: '00'.repeat(32) }], undefined, alice)
		).rejects.toBeInstanceOf(CredoNotSupportedError);
		nothingWritten(h);
	});

	it('refuses DID methods other than cheqd, unresolvable DIDs and deactivated DIDs', async () => {
		await expect(
			h.engine.importDid('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', [], undefined, alice)
		).rejects.toBeInstanceOf(CredoNotSupportedError);
		await expect(h.engine.importDid(DID, [], undefined, alice)).rejects.toThrow(`Error resolving ${DID}`);
		const edKey = ed25519();
		publish(h, documentFor(DID, [edKey]), true);
		await expect(
			h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice)
		).rejects.toThrow('deactivated');
		nothingWritten(h);
	});
});

// ------------------------------------------------------------------------------------------- exportDid

describe('exportDid', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	/** A DID created by Credo with its default P-256 plus Ed25519 document, published to the fake resolver. */
	async function credoDid() {
		const identifier = await h.engine.createDid('testnet', { id: DID }, alice);
		const created = h.runtime.calls.find((c) => c.method === 'createDid')?.args[0] as {
			didDocument: EngineDidDocument;
		};
		publish(h, created.didDocument);
		return { identifier, document: created.didDocument };
	}

	it('returns the Veramo export shape with the private key of every verification method', async () => {
		const { identifier, document } = await credoDid();
		const exported = await h.engine.exportDid(DID, '', alice);

		expect(exported).toMatchObject({
			'@context': ['https://w3id.org/wallet/v1', 'https://w3id.org/did-resolution/v1'],
			id: DID,
			type: ['DIDResolutionResponse'],
			didDocument: document,
			didDocumentMetadata: {},
			didResolutionMetadata: {},
		});
		const methods = document.verificationMethod as { id: string; type: string }[];
		expect(exported.keys).toHaveLength(2);
		exported.keys.forEach((entry, index) => {
			const kid = identifier.keys?.[index].kid as string;
			const privateKeyHex = h.store.keyMaterial.get(kid)?.privateKeyHex as string;
			const withHeader = (keyHex: string) =>
				bases.base58btc.encode(new Uint8Array([0xed, 0x01, ...Buffer.from(keyHex, 'hex')]));
			expect(Object.keys(entry).sort()).toEqual(
				[
					'@context',
					'id',
					'type',
					'controller',
					'name',
					'correlation',
					'created',
					'publicKeyMultibase',
					'privateKeyMultibase',
					'publicKeyBase58',
					'privateKeyBase58',
				].sort()
			);
			expect(entry).toMatchObject({
				'@context': ['https://w3id.org/wallet/v1'],
				id: methods[index].id,
				type: [methods[index].type],
				controller: methods[index].id,
				name: kid,
				correlation: [methods[index].id],
				publicKeyMultibase: withHeader(kid),
				privateKeyMultibase: withHeader(privateKeyHex),
			});
			expect(Buffer.from(bases.base58btc.decode(`z${entry.privateKeyBase58}`)).toString('hex')).toBe(
				privateKeyHex
			);
			expect(Buffer.from(bases.base58btc.decode(`z${entry.publicKeyBase58}`)).toString('hex')).toBe(kid);
		});
	});

	it('exports an imported DID with the key that was imported (round trip)', async () => {
		const edKey = ed25519();
		publish(h, documentFor(DID, [edKey]));
		await h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice);
		const exported = await h.engine.exportDid(DID, '', alice);
		expect(Buffer.from(bases.base58btc.decode(`z${exported.keys[0].privateKeyBase58}`)).toString('hex')).toBe(
			edKey.seedAndPublicHex
		);
	});

	it("gives the same answer for another customer's DID as for a missing one, and reads no key", async () => {
		await credoDid();
		const read = jest.spyOn(h.store, 'readOwnedPrivateKey');
		const notOwned = (await h.engine.exportDid(DID, '', bob).catch((e: Error) => e)) as Error;
		const missing = 'did:cheqd:testnet:00000000-0000-4000-8000-000000000000';
		const absent = (await h.engine.exportDid(missing, '', bob).catch((e: Error) => e)) as Error;

		// Exactly the Veramo path's error: a plain Error, so both answer the same status and body
		expect(notOwned.constructor).toBe(Error);
		expect(absent.constructor).toBe(Error);
		expect(notOwned.message).toBe(`${DID} not found in wallet`);
		expect(absent.message).toBe(`${missing} not found in wallet`);
		expect(read).not.toHaveBeenCalled();
	});

	it('refuses a verification method whose key is not in the identifier, like the Veramo path', async () => {
		const edKey = ed25519();
		const other = ed25519();
		publish(h, documentFor(DID, [edKey]));
		await h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice);
		// The document on the ledger has since gained a key alice does not hold
		publish(h, documentFor(DID, [edKey], [other]));
		await expect(h.engine.exportDid(DID, '', alice)).rejects.toThrow(
			`Key not found in wallet: ${other.publicKeyHex}`
		);
	});

	it("never reads a private key for a key row that is not the customer's own", async () => {
		const edKey = ed25519();
		publish(h, documentFor(DID, [edKey]));
		await h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice);
		// The key row moves to bob (a corrupted row): the export must not hand alice the private key
		h.store.keys[0].customerId = 'bob';
		await expect(h.engine.exportDid(DID, '', alice)).rejects.toThrow(
			`Private key not found for kid: ${edKey.publicKeyHex}`
		);
	});

	it('refuses a verification method with no usable key', async () => {
		const edKey = ed25519();
		publish(h, documentFor(DID, [edKey]));
		await h.engine.importDid(DID, [{ type: 'Ed25519', privateKeyHex: edKey.privateKeyHex }], undefined, alice);
		const document = documentFor(DID, [edKey]);
		(document.verificationMethod as Record<string, unknown>[]).push({
			id: `${DID}#key-9`,
			type: 'X25519KeyAgreementKey2020',
			controller: DID,
			publicKeyMultibase: 'z6LSbysY2xFMRpGMhb7tFTLMpeuPRaqaWM1yECx2AtzE3KCc',
		});
		publish(h, document);
		await expect(h.engine.exportDid(DID, '', alice)).rejects.toThrow('Not supported');
	});

	it('round-trips through the password-encrypted envelope the API returns', async () => {
		await credoDid();
		const exported = await h.engine.exportDid(DID, '', alice);
		const password = `pw-${Math.random().toString(36).slice(2)}-Export`;
		const envelope = await encryptKeyExport(exported, password);
		expect(JSON.stringify(envelope)).not.toContain(exported.keys[0].privateKeyBase58);
		expect(await decryptKeyExport(envelope, password)).toEqual(JSON.parse(JSON.stringify(exported)));
	});
});
