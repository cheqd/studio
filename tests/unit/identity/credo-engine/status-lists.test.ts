import { beforeEach, describe, expect, it } from '@jest/globals';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import {
	createBitstring,
	encodeBitstring,
	getBitstringStatus,
	setBitstringStatus,
	decodeBitstring,
} from '@credo-ts/cheqd';
import { CredoEngine } from '../../../../src/services/identity/engine/credo/credo-engine.js';
import { EncryptedStatusListNotSupportedError } from '../../../../src/services/identity/engine/credo/status-lists.js';
import type { CredoTenantSession } from '../../../../src/services/identity/engine/credo/ports.js';
import type { LedgerResourceRead } from '../../../../src/services/identity/engine/credo/status-list-types.js';
import { SafeFetchError, type SafeFetch } from '../../../../src/helpers/safe-fetch.js';
import { EngineGoneError } from '../../../../src/services/identity/engine/errors.js';
import { customer, FakeRuntime, FakeStore } from './fakes.js';
import { STATUS_LIST_MAX_LENGTH } from '../../../../src/types/constants.js';

const alice = customer('alice');
const bob = customer('bob');
const DID = 'did:cheqd:testnet:11111111-1111-4111-8111-111111111111';
const OTHER_DID = 'did:cheqd:testnet:22222222-2222-4222-8222-222222222222';
const URL_BASE = 'https://resolver.cheqd.net/1.0/identifiers/';

const metaOf = (did: string, id: string, name: string, resourceType: string, version = '1.0') => ({
	id,
	collectionId: did.split(':')[3],
	name,
	version,
	resourceType,
	mediaType: 'application/json',
	created: new Date('2026-11-13T10:00:00.456Z'),
	checksum: 'abc',
	previousVersionId: '',
	nextVersionId: '',
});

/** A runtime that serves linked resources from a map and records signing and writes. */
class StatusRuntime extends FakeRuntime {
	resources = new Map<string, { resource: unknown; meta: ReturnType<typeof metaOf> }>(); // by did url
	tokenLists = new Map<string, string>(); // `${did}|${name}`
	didDocuments = new Map<string, Record<string, unknown>>();
	signed: unknown[] = [];
	written: {
		did: string;
		resource: { id: string; name: string; resourceType: string; data: unknown; version?: string };
	}[] = [];

	put(did: string, name: string, type: string, resource: unknown, id: string = crypto.randomUUID()) {
		const meta = metaOf(did, id, name, type);
		this.resources.set(`${did}?resourceName=${encodeURIComponent(name)}&resourceType=${type}`, { resource, meta });
		this.resources.set(`${did}/resources/${id}`, { resource, meta });
		return id;
	}

	parseOrText(text: string) {
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	async readResource(didUrl: string): Promise<LedgerResourceRead> {
		this.events.push(`read:${didUrl.split('?')[1] ?? didUrl.split('/resources/')[1]}`);
		const found = this.resources.get(didUrl);
		return found ? { resource: found.resource, resourceMetadata: found.meta } : { error: 'notFound' };
	}
	async readTokenStatusList(did: string, name: string) {
		const jwt = this.tokenLists.get(`${did}|${name}`);
		return jwt ? { format: 'jwt' as const, statusList: jwt, resourceId: 'r', version: 'v' } : null;
	}
	async resolveDid(did?: string) {
		const didDocument = this.didDocuments.get(did ?? '') ?? null;
		return { didDocument: didDocument as never, didDocumentMetadata: {}, didResolutionMetadata: {} };
	}
	async withTenant<T>(tenantId: string, work: (session: CredoTenantSession) => Promise<T>) {
		return super.withTenant(tenantId, (session) =>
			work({
				...session,
				createResource: async (did, resource) => {
					this.written.push({ did, resource: resource as never });
					const result = await session.createResource(did, resource);
					if (result.state === 'finished') {
						this.put(
							did,
							resource.name,
							resource.resourceType,
							this.parseOrText(new TextDecoder().decode(resource.data as Uint8Array)),
							resource.id
						);
					}
					return result;
				},
				statusLists: {
					signBitstringProof: async (input) => {
						this.signed.push(input);
						return 'proof.jwt.value';
					},
					createTokenStatusList: async (input) => {
						this.signed.push(input);
						return 'created.token.jwt';
					},
					updateTokenStatusList: async (input) => {
						this.signed.push(input);
						return 'updated.token.jwt';
					},
				},
			})
		);
	}
}

interface Harness {
	engine: CredoEngine;
	store: FakeStore;
	runtime: StatusRuntime;
	events: string[];
	fetchCalls: string[];
	fetchBody: { value: unknown; fail: boolean };
	claimed: { count: number; asked: string[] };
}

function harness(): Harness {
	const store = new FakeStore();
	const runtime = new StatusRuntime();
	const events = runtime.events;
	const fetchCalls: string[] = [];
	const fetchBody = { value: {} as unknown, fail: false };
	const claimed = { count: 0, asked: [] as string[] };
	const safeFetch: SafeFetch = async (url) => {
		fetchCalls.push(url);
		if (fetchBody.fail) throw new SafeFetchError('blocked-destination');
		return { status: 200, headers: {}, url, body: new TextEncoder().encode(JSON.stringify(fetchBody.value)) };
	};
	const engine = new CredoEngine({
		store,
		runtime,
		safeFetch,
		resolverUrl: URL_BASE,
		statusListOwnership: {
			countClaimedByOthers: async (customerId, did, name) => {
				claimed.asked.push(`${customerId}|${did}|${name}`);
				return claimed.count;
			},
		},
		withPayerLock: async (address, work) => {
			events.push(`lock:${address}`);
			try {
				return await work();
			} finally {
				events.push(`unlock:${address}`);
			}
		},
	});
	store.addPayer('alice', 'testnet', 'cheqd1alice');
	store.addPayer('bob', 'testnet', 'cheqd1bob');
	store.identifiers.push({ did: DID, provider: 'did:cheqd:testnet', keyIds: [], services: [], customerId: 'alice' });
	runtime.didDocuments.set(DID, {
		id: DID,
		verificationMethod: [
			{ id: `${DID}#key-1`, type: 'JsonWebKey2020', publicKeyJwk: { kty: 'EC', crv: 'P-256' } },
			{ id: `${DID}#key-2`, type: 'Ed25519VerificationKey2020' },
		],
		authentication: [`${DID}#key-1`, `${DID}#key-2`],
	});
	return { engine, store, runtime, events, fetchCalls, fetchBody, claimed };
}

const sl2021Content = (indices: number[] = [], purpose = 'revocation', extra: Record<string, unknown> = {}) => {
	const bits = createBitstring(140000, 1);
	for (const i of indices) setBitstringStatus(bits, i, 1, 1);
	return {
		StatusList2021: {
			statusPurpose: purpose,
			encodedList: encodeBitstring(bits),
			validFrom: '2026-01-01T00:00:00.000Z',
		},
		metadata: {
			type: purpose === 'revocation' ? 'StatusList2021Revocation' : 'StatusList2021Suspension',
			encrypted: false,
			encoding: 'base64url',
			...extra,
		},
	};
};
const bitstringContent = (entries: [number, number][] = [], size = 2) => {
	const bits = createBitstring(131072, size);
	for (const [i, v] of entries) setBitstringStatus(bits, i, size, v);
	return {
		bitstringStatusListCredential: {
			'@context': ['https://www.w3.org/2018/credentials/v1'],
			type: ['VerifiableCredential', 'BitstringStatusListCredential'],
			issuer: { id: DID },
			issuanceDate: '2026-01-01T00:00:00.000Z',
			credentialSubject: {
				type: 'BitstringStatusList',
				statusPurpose: ['revocation', 'suspension', 'message'],
				encodedList: encodeBitstring(bits),
			},
			proof: { type: 'JwtProof2020', jwt: 'a.b.c' },
		},
		metadata: {
			encrypted: false,
			encoding: 'base64url',
			length: 131072,
			statusSize: size,
			statusMessages: [
				{ status: '0x0', message: 'issued' },
				{ status: '0x1', message: 'revoked' },
				{ status: '0x2', message: 'suspended' },
				{ status: '0x3', message: 'unknown' },
			],
		},
	};
};
const decodedWrite = (h: Harness, n = 0) =>
	JSON.parse(new TextDecoder().decode(h.runtime.written[n].resource.data as Uint8Array));

describe('status list creation', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('creates a StatusList2021 list in the plugin form, under the payer lock', async () => {
		const result = await h.engine.createUnencryptedStatusList2021(
			DID,
			{ name: 'list-a', resourceType: 'x', version: '1.0' },
			{ length: 140000, encoding: 'base64url', statusPurpose: 'revocation' },
			alice
		);
		expect(result.created).toBe(true);
		expect(result.encrypted).toBe(false);
		expect(h.runtime.written).toHaveLength(1);
		const written = h.runtime.written[0];
		expect(written.did).toBe(DID);
		expect(written.resource.resourceType).toBe('StatusList2021Revocation');
		expect(written.resource.version).toBe('1.0');
		expect(written.resource.data).toBeInstanceOf(Uint8Array);
		const content = decodedWrite(h);
		expect(Object.keys(content)).toEqual(['StatusList2021', 'metadata']);
		expect(Object.keys(content.metadata)).toEqual(['type', 'encrypted', 'encoding']);
		expect(decodeBitstring(content.StatusList2021.encodedList).length).toBe(17500);
		expect(result.resourceMetadata).toMatchObject({
			resourceName: 'list-a',
			resourceVersion: '1.0',
			previousVersionId: null,
		});
		expect(h.events.indexOf('lock:cheqd1alice')).toBeLessThan(h.events.indexOf('createResource'));
		expect(h.events.indexOf('createResource')).toBeLessThan(h.events.indexOf('unlock:cheqd1alice'));
	});

	it('refuses oversize lists before allocating anything, and accepts the largest allowed one', async () => {
		const tooBig = STATUS_LIST_MAX_LENGTH + 1;
		const sl2021 = (options: Record<string, unknown>) =>
			h.engine.createUnencryptedStatusList2021(DID, { name: 'big', resourceType: 'x' }, options as never, alice);
		const bitstring = (options: Record<string, unknown>) =>
			h.engine.createUnencryptedBitstringStatusList(
				DID,
				{ name: 'big', resourceType: 'x' },
				options as never,
				alice
			);
		await expect(sl2021({ length: tooBig })).rejects.toThrow(/between 1 and/);
		await expect(sl2021({ length: 4_000_000_000 })).rejects.toThrow(/between 1 and/);
		await expect(bitstring({ length: tooBig })).rejects.toThrow(/between 1 and/);
		await expect(bitstring({ length: 4_000_000_000, size: 8 })).rejects.toThrow(/between 1 and/);
		await expect(bitstring({ length: 131072.5 })).rejects.toThrow();
		await expect(bitstring({ length: 131072, size: 9 })).rejects.toThrow(/between 1 and 8/);
		await expect(h.engine.createTokenStatusList(DID, { name: 'tsl', size: tooBig }, alice)).rejects.toThrow(
			/between 1 and/
		);
		expect(h.runtime.written).toHaveLength(0);

		const started = performance.now();
		await sl2021({ length: STATUS_LIST_MAX_LENGTH });
		await bitstring({ length: STATUS_LIST_MAX_LENGTH, size: 8 });
		expect(performance.now() - started).toBeLessThan(2000);
		expect(h.runtime.written).toHaveLength(2);
	});

	it('refuses short lists, unknown purposes and encodings, and a missing name', async () => {
		const create = (options: Record<string, unknown>, name = 'n') =>
			h.engine.createUnencryptedStatusList2021(DID, { name, resourceType: 'x' }, options as never, alice);
		await expect(create({ length: 1000 })).rejects.toThrow(/greater than or equal to 131072/);
		await expect(create({ statusPurpose: 'message' })).rejects.toThrow(/statusPurpose/);
		await expect(create({ encoding: 'base64' })).rejects.toThrow(/ncoding/);
		await expect(create({}, '')).rejects.toThrow(/name is required/);
		expect(h.runtime.written).toHaveLength(0);
	});

	it("refuses another customer's DID before signing or writing anything", async () => {
		await expect(
			h.engine.createUnencryptedStatusList2021(DID, { name: 'x', resourceType: 'x' }, {}, bob)
		).rejects.toThrow(`${DID} not found in wallet`);
		await expect(
			h.engine.createUnencryptedBitstringStatusList(DID, { name: 'x', resourceType: 'x' }, {}, bob)
		).rejects.toThrow(/not found in wallet/);
		expect(h.runtime.written).toHaveLength(0);
		expect(h.runtime.signed).toHaveLength(0);
		expect(h.events.some((e) => e.startsWith('lock:'))).toBe(false);
	});

	it('refuses a list name another customer has registered under the same issuer', async () => {
		h.claimed.count = 1;
		await expect(
			h.engine.createUnencryptedStatusList2021(DID, { name: 'taken', resourceType: 'x' }, {}, alice)
		).rejects.toThrow(/Status list taken not found in wallet/);
		expect(h.claimed.asked).toEqual([`alice|${DID}|taken`]);
		expect(h.runtime.written).toHaveLength(0);
	});

	it('creates a Bitstring list: signed by the Ed25519 key, Veramo defaults, size 1 unless asked', async () => {
		const result = await h.engine.createUnencryptedBitstringStatusList(
			DID,
			{ name: 'bits', resourceType: 'x', version: '1.0' },
			{ statusPurpose: 'revocation', size: 2 },
			alice
		);
		expect(result.created).toBe(true);
		expect(h.runtime.signed[0]).toMatchObject({ did: DID, signerDidUrl: `${DID}#key-2`, purposes: ['revocation'] });
		const content = decodedWrite(h);
		expect(content.bitstringStatusListCredential.proof).toEqual({ type: 'JwtProof2020', jwt: 'proof.jwt.value' });
		expect(content.bitstringStatusListCredential.credentialSubject.statusPurpose).toBe('revocation');
		expect(content.metadata).toMatchObject({
			encrypted: false,
			encoding: 'base64url',
			length: 131072,
			statusSize: 2,
		});
		expect(content.metadata.statusMessages[0].message).toBe('issued');
		expect(h.runtime.written[0].resource.resourceType).toBe('BitstringStatusListCredential');
	});

	it('answers Gone for encrypted lists, whoever asks, and writes nothing', async () => {
		await expect(
			h.engine.createEncryptedStatusList2021(DID, { name: 'e', resourceType: 'x' }, {}, alice)
		).rejects.toBeInstanceOf(EngineGoneError);
		await expect(
			h.engine.createEncryptedBitstringStatusList(DID, { name: 'e', resourceType: 'x' }, {}, bob)
		).rejects.toBeInstanceOf(EngineGoneError);
		expect(h.runtime.written).toHaveLength(0);
	});

	it('says plainly that existing encrypted lists are not supported', async () => {
		h.runtime.put(DID, 'enc', 'StatusList2021Revocation', sl2021Content([], 'revocation', { encrypted: true }));
		await expect(
			h.engine.updateUnencryptedStatusList(
				DID,
				'StatusList2021',
				{ statusListName: 'enc', indices: [1], statusAction: 1 },
				alice
			)
		).rejects.toBeInstanceOf(EncryptedStatusListNotSupportedError);
		await expect(
			h.engine.checkStatusList2021(
				DID,
				{ statusListName: 'enc', statusListIndex: 1, statusPurpose: 'revocation' },
				alice
			)
		).rejects.toThrow(/encrypted status lists/);
		await expect(h.engine.updateEncryptedStatusList(DID, 'StatusList2021', {}, alice)).rejects.toThrow(
			/encrypted status lists/
		);
		await expect(
			h.engine.revokeCredentials({} as never, 'StatusList2021', true, alice, 'a-key')
		).rejects.toBeInstanceOf(EncryptedStatusListNotSupportedError);
		expect(h.runtime.written).toHaveLength(0);
	});
});

describe('status list updates', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('revokes on StatusList2021: reads inside the lock, rebuilds the content in the plugin order, keeps validFrom', async () => {
		h.runtime.put(DID, 'list-a', 'StatusList2021Revocation', sl2021Content([3]));
		const result = await h.engine.updateUnencryptedStatusList(
			DID,
			'StatusList2021',
			{ indices: [1, 2], statusListName: 'list-a', statusAction: 1 },
			alice
		);
		expect(result.revoked).toEqual([true, true]);
		expect(result.published).toBe(true);
		const content = decodedWrite(h);
		expect(Object.keys(content.metadata)).toEqual(['type', 'encoding', 'encrypted']);
		expect(content.StatusList2021.validFrom).toBe('2026-01-01T00:00:00.000Z');
		const bits = decodeBitstring(content.StatusList2021.encodedList);
		expect([1, 2, 3, 4].map((i) => getBitstringStatus(bits, i, 1))).toEqual([1, 1, 1, 0]);
		expect(result.resourceMetadata).toMatchObject({
			resourceName: 'list-a',
			resourceType: 'StatusList2021Revocation',
		});
		// the read that decides the new bits happens after the lock is taken
		expect(h.events.indexOf('lock:cheqd1alice')).toBeLessThan(h.events.findIndex((e) => e.startsWith('read:')));
		expect(h.events.indexOf('createResource')).toBeLessThan(h.events.indexOf('unlock:cheqd1alice'));
	});

	it('suspends and reinstates on the suspension list', async () => {
		h.runtime.put(DID, 'sus', 'StatusList2021Suspension', sl2021Content([5], 'suspension'));
		const reinstated = await h.engine.updateUnencryptedStatusList(
			DID,
			'StatusList2021',
			{ indices: [5], statusListName: 'sus', statusAction: 0 },
			alice
		);
		expect(reinstated.unsuspended).toEqual([true]);
		expect(getBitstringStatus(decodeBitstring(decodedWrite(h).StatusList2021.encodedList), 5, 1)).toBe(0);
		const suspended = await h.engine.updateUnencryptedStatusList(
			DID,
			'StatusList2021',
			{ indices: [6], statusListName: 'sus', statusAction: 2 },
			alice
		);
		expect(suspended.suspended).toEqual([true]);
	});

	it('returns an error object for an index outside the list and writes nothing', async () => {
		h.runtime.put(DID, 'list-a', 'StatusList2021Revocation', sl2021Content());
		const result = await h.engine.updateUnencryptedStatusList(
			DID,
			'StatusList2021',
			{ indices: [9999999], statusListName: 'list-a', statusAction: 1 },
			alice
		);
		expect(result.error).toBeInstanceOf(Error);
		expect(result.revoked).toEqual([]);
		expect(h.runtime.written).toHaveLength(0);
	});

	it('refuses to update a list under a DID the caller does not own, and a list another customer registered', async () => {
		h.runtime.put(DID, 'list-a', 'StatusList2021Revocation', sl2021Content());
		await expect(
			h.engine.updateUnencryptedStatusList(
				DID,
				'StatusList2021',
				{ indices: [1], statusListName: 'list-a', statusAction: 1 },
				bob
			)
		).rejects.toThrow(`${DID} not found in wallet`);
		h.claimed.count = 1;
		await expect(
			h.engine.updateUnencryptedStatusList(
				DID,
				'StatusList2021',
				{ indices: [1], statusListName: 'list-a', statusAction: 1 },
				alice
			)
		).rejects.toThrow(/not found in wallet/);
		expect(h.runtime.written).toHaveLength(0);
		expect(h.events.some((e) => e.startsWith('lock:'))).toBe(false);
	});

	it('updates a Bitstring list: spreads the stored credential, changes only encodedList, skips unchanged entries', async () => {
		const stored = bitstringContent([[7, 1]]);
		h.runtime.put(DID, 'bits', 'BitstringStatusListCredential', stored);
		const result = await h.engine.updateUnencryptedStatusList(
			DID,
			'BitstringStatusList',
			{ indices: [7, 8], statusListName: 'bits', statusAction: 1 },
			alice
		);
		expect(result.updated).toEqual([false, true]);
		expect(result.statusMessages).toEqual(['revoked', 'revoked']);
		const written = decodedWrite(h);
		expect(Object.keys(written.bitstringStatusListCredential)).toEqual(
			Object.keys(stored.bitstringStatusListCredential)
		);
		expect(written.bitstringStatusListCredential.proof).toEqual(stored.bitstringStatusListCredential.proof);
		expect(written.metadata).toEqual(stored.metadata);
		const bits = decodeBitstring(written.bitstringStatusListCredential.credentialSubject.encodedList);
		expect([7, 8, 9].map((i) => getBitstringStatus(bits, i, 2))).toEqual([1, 1, 0]);
	});

	it('writes nothing when no Bitstring entry changes, and refuses a value that does not fit', async () => {
		h.runtime.put(DID, 'bits', 'BitstringStatusListCredential', bitstringContent([[7, 1]]));
		const same = await h.engine.updateUnencryptedStatusList(
			DID,
			'BitstringStatusList',
			{ indices: [7], statusListName: 'bits', statusAction: 1 },
			alice
		);
		expect(same.updated).toEqual([false]);
		expect(h.runtime.written).toHaveLength(0);
		await expect(
			h.engine.updateUnencryptedStatusList(
				DID,
				'BitstringStatusList',
				{ indices: [7], statusListName: 'bits', statusAction: 4 },
				alice
			)
		).rejects.toThrow(/newStatus must be 0-3/);
	});
});

describe('status checks and search', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('checks StatusList2021 for the owner only', async () => {
		h.runtime.put(DID, 'list-a', 'StatusList2021Revocation', sl2021Content([10]));
		const opts = { statusListName: 'list-a', statusListIndex: 10, statusPurpose: 'revocation' };
		expect(await h.engine.checkStatusList2021(DID, opts, alice)).toEqual({ revoked: true });
		expect(await h.engine.checkStatusList2021(DID, { ...opts, statusListIndex: 11 }, alice)).toEqual({
			revoked: false,
		});
		await expect(h.engine.checkStatusList2021(DID, opts, bob)).rejects.toThrow(/not found in wallet/);
	});

	it('checks a Bitstring list on the ledger: single, bulk and ranges, in the plugin result shape', async () => {
		h.runtime.put(
			DID,
			'bits',
			'BitstringStatusListCredential',
			bitstringContent([
				[5, 1],
				[6, 2],
			])
		);
		const url = `${URL_BASE}${DID}?resourceName=bits&resourceType=BitstringStatusListCredential`;
		const entry = {
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListCredential: url,
			statusSize: 2,
			statusMessage: [{ status: '0x1', message: 'revoked' }],
		};
		expect(await h.engine.checkBitstringStatusList(DID, { ...entry, statusListIndex: '5' }, alice)).toEqual({
			status: 1,
			purpose: 'message',
			valid: false,
			message: 'revoked',
		});
		expect(await h.engine.checkBitstringStatusList(DID, { ...entry, statusListIndex: '4' }, alice)).toEqual({
			status: 0,
			purpose: 'message',
			valid: true,
		});
		const bulk = await h.engine.checkBitstringStatusList(DID, { ...entry, statusListIndices: [6, '4-5'] }, alice);
		expect(bulk).toEqual([
			{ status: 0, purpose: 'message', valid: true, index: 4 },
			{ status: 1, purpose: 'message', valid: false, index: 5, message: 'revoked' },
			{ status: 2, purpose: 'message', valid: false, index: 6 },
		]);
		const outOfRange = (await h.engine.checkBitstringStatusList(
			DID,
			{ ...entry, statusListIndices: [999999999] },
			alice
		)) as { status: number }[];
		expect(outOfRange[0]).toMatchObject({ status: -1, valid: false });
		await expect(
			h.engine.checkBitstringStatusList(
				DID,
				{ ...entry, statusPurpose: 'revocation', statusListIndex: '1' },
				alice
			)
		).resolves.toBeDefined();
		await expect(
			h.engine.checkBitstringStatusList(DID, { ...entry, statusPurpose: 'refresh', statusListIndex: '1' }, alice)
		).rejects.toThrow(/STATUS_VERIFICATION_ERROR/);
		expect(h.fetchCalls).toEqual([]);
	});

	it('fetches a list hosted outside did:cheqd only through the safe fetch, and fails generically when it refuses', async () => {
		const hosted = bitstringContent([[3, 1]]);
		h.fetchBody.value = hosted;
		const entry = {
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListCredential: 'https://lists.example/status/1',
			statusListIndex: '3',
		};
		expect(await h.engine.checkBitstringStatusList(DID, entry, alice)).toMatchObject({ status: 1, valid: false });
		expect(h.fetchCalls).toEqual(['https://lists.example/status/1']);

		// a bare W3C list credential is accepted too (entries of 1 bit unless the entry says otherwise)
		const bits = createBitstring(131072, 1);
		setBitstringStatus(bits, 9, 1, 1);
		h.fetchBody.value = {
			type: ['VerifiableCredential', 'BitstringStatusListCredential'],
			credentialSubject: { statusPurpose: 'revocation', encodedList: `u${encodeBitstring(bits)}` },
		};
		expect(
			await h.engine.checkBitstringStatusList(
				DID,
				{ ...entry, statusPurpose: 'revocation', statusListIndex: '9' },
				alice
			)
		).toMatchObject({ status: 1, valid: false });

		h.fetchBody.fail = true;
		await expect(
			h.engine.checkBitstringStatusList(
				DID,
				{ ...entry, statusListCredential: 'https://169.254.169.254/latest', statusListIndex: '1' },
				alice
			)
		).rejects.toThrow('[credo]: STATUS_RETRIEVAL_ERROR');
	});

	it('refuses a list too short to be a Bitstring status list', async () => {
		const bits = createBitstring(1000, 1);
		h.fetchBody.value = { credentialSubject: { statusPurpose: 'revocation', encodedList: encodeBitstring(bits) } };
		await expect(
			h.engine.checkBitstringStatusList(
				DID,
				{ statusPurpose: 'revocation', statusListCredential: 'https://x.example/l', statusListIndex: '1' },
				alice
			)
		).rejects.toThrow(/STATUS_LIST_LENGTH_ERROR/);
	});

	it('searches without a customer, in the resolver metadata shape, and reports a missing list as notFound', async () => {
		h.runtime.put(DID, 'list-a', 'StatusList2021Revocation', sl2021Content());
		const found = await h.engine.searchStatusList(DID, 'list-a', 'StatusList2021', 'revocation');
		expect(found.found).toBe(true);
		expect(Object.keys(found.resourceMetadata as object).sort()).toEqual([
			'checksum',
			'created',
			'mediaType',
			'nextVersionId',
			'previousVersionId',
			'resourceCollectionId',
			'resourceId',
			'resourceName',
			'resourceType',
			'resourceURI',
			'resourceVersion',
		]);
		expect(found.resourceMetadata).toMatchObject({
			created: '2026-11-13T10:00:00Z',
			previousVersionId: null,
			nextVersionId: null,
		});
		expect(await h.engine.searchStatusList(DID, 'nope', 'StatusList2021', 'revocation')).toEqual({
			found: false,
			error: 'notFound',
		});
		await expect(h.engine.searchStatusList(DID, 'list-a', 'StatusList2021')).rejects.toThrow(
			'Status Purpose is required'
		);
	});
});

describe('revoke, suspend and reinstate by credential', () => {
	let h: Harness;
	const url = `${URL_BASE}${DID}?resourceName=bits&resourceType=BitstringStatusListCredential`;
	const credential = (index: number, issuer = DID, listUrl = url) => ({
		issuer,
		credentialStatus: {
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListIndex: String(index),
			statusListCredential: listUrl,
		},
	});
	beforeEach(() => {
		h = harness();
		h.runtime.put(DID, 'bits', 'BitstringStatusListCredential', bitstringContent());
	});

	it('revokes a single credential and flattens the result like the plugin', async () => {
		const result = await h.engine.revokeCredentials(
			credential(12) as never,
			'BitstringStatusList',
			true,
			alice,
			''
		);
		expect(result).toMatchObject({
			updated: true,
			statusValue: 1,
			previousStatusValue: 0,
			statusMessage: 'revoked',
			published: true,
		});
		const bits = decodeBitstring(decodedWrite(h).bitstringStatusListCredential.credentialSubject.encodedList);
		expect(getBitstringStatus(bits, 12, 2)).toBe(1);
		const reinstated = await h.engine.reinstateCredentials(
			credential(12) as never,
			'BitstringStatusList',
			true,
			alice,
			''
		);
		expect(reinstated).toMatchObject({ updated: true, statusValue: 0 });
		const suspended = await h.engine.suspendCredentials(
			[credential(13), credential(14)] as never,
			'BitstringStatusList',
			true,
			alice,
			''
		);
		expect(suspended.updated).toEqual([true, true]);
	});

	it('does not write when publish is false', async () => {
		const result = await h.engine.revokeCredentials(
			credential(1) as never,
			'BitstringStatusList',
			false,
			alice,
			''
		);
		expect(result.updated).toBe(true);
		expect(result.statusList).toBeDefined();
		expect(h.runtime.written).toHaveLength(0);
	});

	it('refuses a credential whose issuer is not the caller, and a list under any other DID', async () => {
		await expect(
			h.engine.revokeCredentials(credential(1) as never, 'BitstringStatusList', true, bob, '')
		).rejects.toThrow(`${DID} not found in wallet`);
		h.store.identifiers.push({
			did: OTHER_DID,
			provider: 'did:cheqd:testnet',
			keyIds: [],
			services: [],
			customerId: 'alice',
		});
		const foreign = `${URL_BASE}${OTHER_DID}?resourceName=bits&resourceType=BitstringStatusListCredential`;
		await expect(
			h.engine.revokeCredentials(credential(1, DID, foreign) as never, 'BitstringStatusList', true, alice, '')
		).rejects.toThrow(/not found in wallet/);
		await expect(
			h.engine.revokeCredentials(
				credential(1, 'did:cheqd:testnet:nope', url) as never,
				'BitstringStatusList',
				true,
				alice,
				''
			)
		).rejects.toThrow(/not found in wallet/);
		await expect(
			h.engine.revokeCredentials(
				credential(1, DID, 'https://elsewhere.example/list') as never,
				'BitstringStatusList',
				true,
				alice,
				''
			)
		).rejects.toThrow(/only did:cheqd/);
		expect(h.runtime.written).toHaveLength(0);
	});

	it('revokes a StatusList2021 credential (single gives a boolean, bulk an array)', async () => {
		h.runtime.put(DID, 'rev', 'StatusList2021Revocation', sl2021Content());
		const listUrl = `${URL_BASE}${DID}?resourceName=rev&resourceType=StatusList2021Revocation`;
		const entry = (i: number) => ({
			issuer: DID,
			credentialStatus: {
				type: 'StatusList2021Entry',
				statusPurpose: 'revocation',
				statusListIndex: String(i),
				statusListCredential: listUrl,
			},
		});
		expect(await h.engine.revokeCredentials(entry(2) as never, 'StatusList2021', true, alice, '')).toMatchObject({
			revoked: true,
			published: true,
		});
		expect(
			await h.engine.revokeCredentials([entry(3), entry(4)] as never, 'StatusList2021', false, alice, '')
		).toMatchObject({ revoked: [true, true], published: true });
	});
});

// ------------------------------------------------------------------------------------ Token Status List

const b64u = (value: object | Uint8Array) =>
	Buffer.from(value instanceof Uint8Array ? value : JSON.stringify(value)).toString('base64url');
function tokenList(entries: [number, number][], bits = 2, size = 64) {
	const bytes = new Uint8Array(Math.ceil((size * bits) / 8));
	for (const [index, status] of entries) bytes[(index * bits) >> 3] |= status << ((index * bits) & 7);
	return b64u(deflateSync(bytes));
}
function signedToken(opts: {
	alg: 'ES256' | 'EdDSA';
	did?: string;
	kid?: string;
	sub?: string;
	exp?: number;
	iss?: string;
	typ?: string;
	tamper?: boolean;
	entries?: [number, number][];
}) {
	const did = opts.did ?? DID;
	const pair =
		opts.alg === 'ES256' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('ed25519');
	const header = { alg: opts.alg, typ: opts.typ ?? 'statuslist+jwt', kid: opts.kid ?? '#key-1' };
	const payload = {
		iss: opts.iss ?? did,
		sub: opts.sub ?? `${URL_BASE}${did}?resourceName=tsl&resourceType=TokenStatusList`,
		iat: 1_700_000_000,
		...(opts.exp ? { exp: opts.exp } : {}),
		status_list: {
			bits: 2,
			lst: tokenList(
				opts.entries ?? [
					[3, 1],
					[4, 2],
				]
			),
		},
	};
	const input = `${b64u(header)}.${b64u(payload)}`;
	const signature =
		opts.alg === 'ES256'
			? sign('sha256', new Uint8Array(Buffer.from(input)), {
					key: createPrivateKey(pair.privateKey.export({ format: 'pem', type: 'pkcs8' })),
					dsaEncoding: 'ieee-p1363',
				})
			: sign(null, new Uint8Array(Buffer.from(input)), pair.privateKey);
	const jwk = createPublicKey(pair.publicKey.export({ format: 'pem', type: 'spki' })).export({ format: 'jwk' });
	const jwt = `${input}.${opts.tamper ? b64u(new Uint8Array(signature.length)) : b64u(signature)}`;
	return { jwt, jwk };
}

describe('Token Status List', () => {
	let h: Harness;
	const uri = `${URL_BASE}${DID}?resourceName=tsl&resourceType=TokenStatusList`;
	beforeEach(() => {
		h = harness();
		h.runtime.didDocuments.set(DID, {
			id: DID,
			verificationMethod: [
				{ id: `${DID}#key-1`, type: 'JsonWebKey2020', publicKeyJwk: { kty: 'EC', crv: 'P-256' } },
			],
			assertionMethod: [`${DID}#key-1`],
		});
	});
	const publish = (token: { jwt: string; jwk: object }, type = 'JsonWebKey2020') => {
		h.runtime.didDocuments.set(DID, {
			id: DID,
			verificationMethod: [{ id: `${DID}#key-1`, type, controller: DID, publicKeyJwk: token.jwk }],
			assertionMethod: [`${DID}#key-1`],
		});
		h.runtime.tokenLists.set(`${DID}|tsl`, token.jwt);
	};

	it('creates a list: signed under the payer lock and written as bytes, with the resolver uri back', async () => {
		const list = await h.engine.createTokenStatusList(DID, { name: 'tsl', bits: 2, size: 128 }, alice);
		expect(list).toMatchObject({ uri, name: 'tsl', bits: 2, size: 128 });
		expect(h.runtime.signed[0]).toMatchObject({ didUrl: `${DID}#key-1`, alg: 'ES256', uri, bits: 2, size: 128 });
		const resource = h.runtime.written[0].resource;
		expect(resource.resourceType).toBe('TokenStatusList');
		expect(resource.data).toBeInstanceOf(Uint8Array);
		expect(new TextDecoder().decode(resource.data as Uint8Array)).toBe('created.token.jwt');
		expect(h.events.indexOf('lock:cheqd1alice')).toBeLessThan(h.events.indexOf('createResource'));
	});

	it('refuses to create over an existing list, or under a DID that is not the caller’s', async () => {
		h.runtime.tokenLists.set(`${DID}|tsl`, 'x.y.z');
		await expect(h.engine.createTokenStatusList(DID, { name: 'tsl' }, alice)).rejects.toThrow(/already exists/);
		await expect(h.engine.createTokenStatusList(DID, { name: 'other' }, bob)).rejects.toThrow(
			/not found in wallet/
		);
		expect(h.runtime.written).toHaveLength(0);
	});

	it('sets statuses: reads the current list inside the lock, re-signs, publishes', async () => {
		h.runtime.tokenLists.set(`${DID}|tsl`, signedToken({ alg: 'ES256' }).jwt);
		await h.engine.setTokenStatus!(DID, uri, [{ index: 5, status: 1 }], alice);
		expect(h.runtime.signed[0]).toMatchObject({ alg: 'ES256', updates: [{ index: 5, status: 1 }] });
		expect(new TextDecoder().decode(h.runtime.written[0].resource.data as Uint8Array)).toBe('updated.token.jwt');
		expect(h.events.indexOf('lock:cheqd1alice')).toBeLessThan(h.events.indexOf('createResource'));
	});

	it('refuses to set statuses on a list of another DID or another customer, or a value that does not fit', async () => {
		h.runtime.tokenLists.set(`${DID}|tsl`, signedToken({ alg: 'ES256' }).jwt);
		await expect(h.engine.setTokenStatus!(DID, uri, [{ index: 1, status: 1 }], bob)).rejects.toThrow(
			/not found in wallet/
		);
		await expect(
			h.engine.setTokenStatus!(
				DID,
				`${URL_BASE}${OTHER_DID}?resourceName=tsl&resourceType=TokenStatusList`,
				[{ index: 1, status: 1 }],
				alice
			)
		).rejects.toThrow(/not found in wallet/);
		await expect(h.engine.setTokenStatus!(DID, uri, [{ index: 1, status: 7 as never }], alice)).rejects.toThrow(
			/does not fit/
		);
		expect(h.runtime.written).toHaveLength(0);
	});

	it.each(['ES256', 'EdDSA'] as const)(
		'reads a verified status from a %s signed list, with no customer',
		async (alg) => {
			publish(signedToken({ alg }), alg === 'ES256' ? 'JsonWebKey2020' : 'JsonWebKey2020');
			expect(await h.engine.getTokenStatus!(uri, 3)).toEqual({ status: 1, verified: true });
			expect(await h.engine.getTokenStatus!(uri, 4)).toEqual({ status: 2, verified: true });
			expect(await h.engine.getTokenStatus!(uri, 0)).toEqual({ status: 0, verified: true });
		}
	);

	it.each([
		['a forged signature', () => signedToken({ alg: 'ES256', tamper: true })],
		['an expired list', () => signedToken({ alg: 'ES256', exp: 1_000_000_000 })],
		['a list signed by a different DID', () => signedToken({ alg: 'ES256', iss: OTHER_DID })],
		[
			'a list whose subject is another list',
			() =>
				signedToken({ alg: 'ES256', sub: `${URL_BASE}${DID}?resourceName=other&resourceType=TokenStatusList` }),
		],
		['a key that is not listed for assertion', () => signedToken({ alg: 'ES256', kid: '#key-9' })],
		['the wrong token type', () => signedToken({ alg: 'ES256', typ: 'JWT' })],
		['an issuer that is not did:cheqd', () => signedToken({ alg: 'ES256', iss: 'did:web:example.com' })],
	])('fails closed on %s', async (_label, make) => {
		publish(make());
		const reading = await h.engine.getTokenStatus!(uri, 3);
		expect(reading.verified).toBe(false);
		expect(reading.status).toBe(-1);
		expect(reading.error).toBe('The status list is unavailable or could not be verified');
	});

	it('fails closed when the list is missing, the DID is deactivated, the key changed or the index is out of range', async () => {
		expect((await h.engine.getTokenStatus!(uri, 3)).verified).toBe(false);
		const token = signedToken({ alg: 'ES256' });
		publish(token);
		expect((await h.engine.getTokenStatus!(uri, 100000)).verified).toBe(false);
		expect((await h.engine.getTokenStatus!(uri, -1)).verified).toBe(false);
		h.runtime.didDocuments.set(DID, {
			id: DID,
			verificationMethod: [
				{ id: `${DID}#key-1`, type: 'JsonWebKey2020', publicKeyJwk: signedToken({ alg: 'ES256' }).jwk },
			],
			assertionMethod: [`${DID}#key-1`],
		});
		expect((await h.engine.getTokenStatus!(uri, 3)).verified).toBe(false);
		h.runtime.resolveDid = async () => ({
			didDocument: { id: DID } as never,
			didDocumentMetadata: { deactivated: true },
			didResolutionMetadata: {},
		});
		expect((await h.engine.getTokenStatus!(uri, 3)).verified).toBe(false);
		h.runtime.resolveDid = async () => {
			throw new Error('boom');
		};
		await expect(h.engine.getTokenStatus!(uri, 3)).resolves.toMatchObject({ verified: false });
		await expect(h.engine.getTokenStatus!('not a uri', 3)).resolves.toMatchObject({ verified: false });
	});

	it('fetches a list hosted elsewhere only through the safe fetch, and never throws when it refuses', async () => {
		const hosted = 'https://lists.example/tsl/1';
		const token = signedToken({ alg: 'EdDSA', sub: hosted });
		h.runtime.didDocuments.set(DID, {
			id: DID,
			verificationMethod: [{ id: `${DID}#key-1`, type: 'JsonWebKey2020', publicKeyJwk: token.jwk }],
			assertionMethod: [`${DID}#key-1`],
		});
		const original = h.fetchBody;
		const engine = new CredoEngine({
			store: h.store,
			runtime: h.runtime,
			withPayerLock: async (_a, w) => w(),
			resolverUrl: URL_BASE,
			safeFetch: async (url) => {
				h.fetchCalls.push(url);
				if (original.fail) throw new SafeFetchError('blocked-destination');
				return { status: 200, headers: {}, url, body: new TextEncoder().encode(token.jwt) };
			},
		});
		expect(await engine.getTokenStatus!(hosted, 3)).toEqual({ status: 1, verified: true });
		expect(h.fetchCalls).toEqual([hosted]);
		original.fail = true;
		expect(await engine.getTokenStatus!('https://169.254.169.254/x', 3)).toMatchObject({ verified: false });
	});
});
