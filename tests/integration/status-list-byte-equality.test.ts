import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import {
	createBitstring,
	decodeBitstring,
	encodeBitstring,
	getBitstringStatus,
	setBitstringStatus,
} from '@credo-ts/cheqd';
import { encodeLegacyBitstring } from '../../src/services/identity/engine/credo/status-list-codec.js';
import { CredoStatusLists } from '../../src/services/identity/engine/credo/status-lists.js';

/**
 * Gate T4 (byte equality) and the "Veramo can read what Credo wrote" half of gate T3. No network, no database.
 *
 * Both sides run their REAL code on the same input list:
 *   - Veramo: `@cheqd/did-provider-cheqd` (the `Cheqd` plugin, as Studio calls it), with `fetch` served from the
 *     input and the broadcast method capturing the payload it would put on the ledger.
 *   - Credo: `CredoStatusLists` (Studio's Credo engine), with a runtime that serves the same input and captures
 *     what `createResource` would be given.
 * The two captured payloads are compared byte for byte. Inputs are the lists on testnet today (recorded as
 * fixtures) plus lists of realistic size and entropy, so that gzip output (pako 2.1 in Veramo, pako 3 in Credo) is
 * exercised with more than an empty bitstring.
 *
 *   npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/status-list-byte-equality.test.ts
 */

const DID = 'did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA';
const RESOLVER = 'https://resolver.cheqd.net/1.0/identifiers/';
const fixture = (name: string) =>
	JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/status-lists/${name}`, import.meta.url)), 'utf8'));

interface Input {
	label: string;
	type: 'StatusList2021Revocation' | 'StatusList2021Suspension' | 'BitstringStatusListCredential';
	name: string;
	content: any;
}

/** A random list: `density` set entries out of `entries`, so gzip has real work to do. */
function randomSl2021(purpose: 'revocation' | 'suspension', entries: number, density: number): Input {
	const bits = createBitstring(entries, 1);
	const picks = randomBytes(density * 4);
	for (let i = 0; i < density; i++) setBitstringStatus(bits, picks.readUInt32LE(i * 4) % entries, 1, 1);
	const type = purpose === 'revocation' ? 'StatusList2021Revocation' : 'StatusList2021Suspension';
	return {
		label: `random ${purpose} ${entries}x${density}`,
		type,
		name: 'random',
		content: {
			StatusList2021: {
				statusPurpose: purpose,
				encodedList: encodeBitstring(bits),
				validFrom: '2026-02-03T04:05:06.789Z',
			},
			// the order Veramo itself writes on CREATE (type, encrypted, encoding): the case where an update reorders
			metadata: { type, encrypted: false, encoding: 'base64url' },
		},
	};
}
function randomBitstring(size: 1 | 2, density: number): Input {
	const base = fixture(size === 2 ? 'bitstring-employee.json' : 'bitstring-ssasaa.json');
	const bits = createBitstring(131072, size);
	const picks = randomBytes(density * 4);
	for (let i = 0; i < density; i++)
		setBitstringStatus(bits, picks.readUInt32LE(i * 4) % 131072, size, size === 2 ? 1 + (i % 2) : 1);
	base.bitstringStatusListCredential.credentialSubject.encodedList = encodeBitstring(bits);
	return {
		label: `random bitstring size ${size} density ${density}`,
		type: 'BitstringStatusListCredential',
		name: 'random',
		content: base,
	};
}

const inputs: Input[] = [
	{
		label: 'testnet testingStatusList (revocation)',
		type: 'StatusList2021Revocation',
		name: 'testingStatusList',
		content: fixture('sl2021-revocation.json'),
	},
	{
		label: 'testnet testingStatusList (suspension)',
		type: 'StatusList2021Suspension',
		name: 'testingStatusList',
		content: fixture('sl2021-suspension.json'),
	},
	{
		label: 'testnet employee-credentials (bitstring, 2 bit)',
		type: 'BitstringStatusListCredential',
		name: 'employee-credentials',
		content: fixture('bitstring-employee.json'),
	},
	{
		label: 'testnet ssasaa (bitstring, 1 bit)',
		type: 'BitstringStatusListCredential',
		name: 'ssasaa',
		content: fixture('bitstring-ssasaa.json'),
	},
	randomSl2021('revocation', 140000, 2500),
	randomSl2021('suspension', 131072, 30000),
	randomSl2021('revocation', 1000000, 40000),
	randomBitstring(2, 5000),
	randomBitstring(1, 20000),
];

// ------------------------------------------------------------------------------------------------ Veramo side

function veramoRun(input: Input, action: 'revoke' | 'suspend' | 'reinstate', indices: number[]) {
	const captured: {
		data: Uint8Array;
		version?: string;
		alsoKnownAs?: unknown;
		name: string;
		resourceType: string;
	}[] = [];
	const listUrl = `${RESOLVER}${DID}?resourceName=${input.name}&resourceType=${input.type}`;
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string | URL) => {
		const text = String(url);
		if (text.endsWith('/metadata')) {
			return Response.json({
				didDocumentMetadata: {
					linkedResourceMetadata: [
						{
							resourceURI: `${DID}/resources/00000000-0000-4000-8000-000000000001`,
							resourceCollectionId: DID.split(':')[3],
							resourceId: '00000000-0000-4000-8000-000000000001',
							resourceName: input.name,
							resourceType: input.type,
							nextVersionId: null,
						},
					],
				},
			});
		}
		if (text.split('#')[0] === listUrl || text === listUrl) return Response.json(input.content);
		throw new Error(`unexpected fetch ${text}`);
	}) as typeof fetch;

	const broadcast = async (args: { payload: any }) => {
		captured.push(args.payload);
		return true;
	};
	const context: any = {
		agent: {
			keyManagerGetKeyManagementSystems: async () => ['local'],
			cheqdBroadcastStatusList2021: broadcast,
			cheqdBroadcastStatusList: broadcast,
		},
	};
	const provider: any = {
		network: 'testnet',
		dkgOptions: { chain: 'cosmos', network: 'datil-test' },
		instantiateDkgThresholdProtocolClient: async () => ({}),
	};
	const plugin: any = new Cheqd({ providers: [provider] });
	const common = {
		fetchList: true,
		publish: true,
		publishEncrypted: false,
		returnUpdatedStatusList: true,
		returnStatusListMetadata: true,
	};
	const base = { issuerDid: DID, statusListName: input.name, statusListIndices: indices };
	const run = async () => {
		if (input.type === 'BitstringStatusListCredential') {
			return plugin.BulkUpdateCredentialsWithStatusList(
				{ newStatus: { revoke: 1, suspend: 2, reinstate: 0 }[action], updateOptions: base, ...common },
				context
			);
		}
		if (action === 'revoke')
			return plugin.RevokeBulkCredentialsWithStatusList2021({ revocationOptions: base, ...common }, context);
		if (action === 'suspend')
			return plugin.SuspendBulkCredentialsWithStatusList2021({ suspensionOptions: base, ...common }, context);
		return plugin.UnsuspendBulkCredentialsWithStatusList2021({ unsuspensionOptions: base, ...common }, context);
	};
	return run()
		.finally(() => {
			globalThis.fetch = realFetch;
		})
		.then((result: any) => ({ result, captured }));
}

// ------------------------------------------------------------------------------------------------- Credo side

function credoRun(input: Input, action: 'revoke' | 'suspend' | 'reinstate', indices: number[]) {
	const captured: {
		data: Uint8Array;
		version?: string;
		alsoKnownAs?: unknown;
		name: string;
		resourceType: string;
	}[] = [];
	const id = '00000000-0000-4000-8000-000000000001';
	const meta = {
		id,
		collectionId: DID.split(':')[3],
		name: input.name,
		version: 'v',
		resourceType: input.type,
		mediaType: 'application/json',
		created: new Date(),
		checksum: '',
		previousVersionId: '',
		nextVersionId: '',
	};
	const lists = new CredoStatusLists({
		store: { isDidOwned: async () => true, findPayerAccount: async () => ({ address: 'cheqd1x', kid: 'k' }) },
		runtime: {
			readResource: async () => ({ resource: JSON.parse(JSON.stringify(input.content)), resourceMetadata: meta }),
			withTenant: async (_t: string, work: any) =>
				work({
					createResource: async (_did: string, resource: any) => {
						captured.push(resource);
						return { state: 'finished' };
					},
				}),
		} as any,
		withPayerLock: (_a, work) => work(),
		ensureTenant: async () => 'tenant',
		safeFetch: async () => {
			throw new Error('no network in this test');
		},
		resolverUrl: RESOLVER,
	});
	const listType = input.type === 'BitstringStatusListCredential' ? 'BitstringStatusList' : 'StatusList2021';
	const statusAction = { revoke: 1, suspend: 2, reinstate: 0 }[action];
	return lists
		.updateUnencryptedStatusList(DID, listType, { indices, statusListName: input.name, statusAction }, {
			customerId: 'c',
		} as never)
		.then((result) => ({ result, captured }));
}

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16);

/** What a regenerated version looks like, for the report. */
function describeDiff(a: Uint8Array, b: Uint8Array): string {
	const x = JSON.parse(Buffer.from(a).toString());
	const y = JSON.parse(Buffer.from(b).toString());
	const encoded = (v: any) => (v.StatusList2021 ?? v.bitstringStatusListCredential.credentialSubject).encodedList;
	return [
		`bytes ${a.length} vs ${b.length}`,
		`encodedList equal: ${encoded(x) === encoded(y)}`,
		`parsed JSON equal: ${JSON.stringify(x) === JSON.stringify(y)}`,
		`keys veramo: ${JSON.stringify(Object.keys(x.metadata))}  credo: ${JSON.stringify(Object.keys(y.metadata))}`,
	].join('; ');
}

describe('T4: the next version of a legacy list is byte-identical on Credo and Veramo', () => {
	for (const input of inputs) {
		const actions: ('revoke' | 'suspend' | 'reinstate')[] =
			input.type === 'StatusList2021Revocation'
				? ['revoke']
				: input.type === 'StatusList2021Suspension'
					? ['suspend', 'reinstate']
					: ['revoke', 'suspend', 'reinstate'];
		for (const action of actions) {
			const indices = [1, 5, 99, 4242, input.label.includes('1000000') ? 999999 : 130000];
			it(`${input.label}: ${action} ${indices.join(',')}`, async () => {
				const settle = <T>(work: Promise<T>) =>
					work.then(
						(value) => ({ value }),
						(error: Error) => ({ error })
					);
				const [veramoOutcome, credoOutcome] = await Promise.all([
					settle(veramoRun(input, action, indices)),
					settle(credoRun(input, action, indices)),
				]);
				// An input one side refuses (a status value the list cannot hold) must be refused by both
				if ('error' in veramoOutcome || 'error' in credoOutcome) {
					assert.ok(
						'error' in veramoOutcome && 'error' in credoOutcome,
						`only one side refused: veramo=${(veramoOutcome as any).error?.message} credo=${(credoOutcome as any).error?.message}`
					);
					return;
				}
				const veramo = veramoOutcome.value;
				const credo = credoOutcome.value;
				// Nothing to change on a Bitstring list: the plugin writes no version, and neither must Credo
				if (input.type === 'BitstringStatusListCredential' && veramo.captured.length === 0) {
					assert.equal(credo.captured.length, 0);
					return;
				}
				const a = veramo.captured[0];
				const b = credo.captured[0];
				assert.equal(b.name, a.name);
				assert.equal(b.resourceType, a.resourceType);
				// Both generate a timestamp version label on update; the content must not depend on it
				assert.ok(a.version && b.version);
				assert.deepEqual(a.alsoKnownAs ?? [], b.alsoKnownAs ?? []);
				const equal = Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
				assert.ok(equal, `bytes differ (${sha(a.data)} vs ${sha(b.data)}): ${describeDiff(a.data, b.data)}`);
			});
		}
	}

	it('encodes a fresh list identically (pako 2.1 in Veramo, pako 3 in Credo) for the default and long lengths', async () => {
		const { StatusList } = await import('@digitalbazaar/vc-status-list');
		const { Bitstring } = await import('@digitalbazaar/bitstring');
		for (const length of [131072, 140000, 1000000]) {
			const veramo = await new StatusList({ length }).encode();
			assert.equal(encodeLegacyBitstring(createBitstring(length, 1)), veramo, `StatusList2021 length ${length}`);
		}
		for (const [length, size] of [
			[131072, 1],
			[131072, 2],
			[262144, 2],
			[131072, 4],
		] as const) {
			const veramo = Buffer.from(
				await new Bitstring({ length: Math.ceil((length * size) / 8) * 8 }).compressBits()
			).toString('base64url');
			assert.equal(encodeLegacyBitstring(createBitstring(length, size)), veramo, `Bitstring ${length}x${size}`);
		}
	});

	it("records why the codec exists: Credo's own encoder differs from the plugin's for a list with entries set", () => {
		const bits = createBitstring(140000, 1);
		const picks = randomBytes(2500 * 4);
		for (let i = 0; i < 2500; i++) setBitstringStatus(bits, picks.readUInt32LE(i * 4) % 140000, 1, 1);
		assert.notEqual(encodeBitstring(bits), encodeLegacyBitstring(bits));
		assert.deepEqual(
			Array.from(decodeBitstring(encodeBitstring(bits))),
			Array.from(decodeBitstring(encodeLegacyBitstring(bits)))
		);
	});

	it('reads and writes the multi-bit order the plugin uses (first bit least significant)', async () => {
		const { Bitstring } = await import('@digitalbazaar/bitstring');
		for (let value = 0; value < 4; value++) {
			const theirs = new Bitstring({ length: 64 });
			(Cheqd as any).setBitValue(theirs, 10 * 2, value, 2);
			const mine = createBitstring(32, 2);
			setBitstringStatus(mine, 10, 2, value);
			assert.deepEqual(Array.from(mine), Array.from(theirs.bits));
			assert.equal(getBitstringStatus(mine, 10, 2), (Cheqd as any).getBitValue(theirs, 20, 2));
		}
	});
});

describe('T3: Veramo reads and updates what Credo writes', () => {
	const runtime = (written: any[]) =>
		({
			readResource: async () => {
				throw new Error('not needed');
			},
			resolveDid: async () => ({
				didDocument: {
					id: DID,
					verificationMethod: [{ id: `${DID}#key-1`, type: 'Ed25519VerificationKey2020' }],
					authentication: [`${DID}#key-1`],
				},
				didDocumentMetadata: {},
				didResolutionMetadata: {},
			}),
			withTenant: async (_t: string, work: any) =>
				work({
					createResource: async (_d: string, resource: any) => {
						written.push(resource);
						return { state: 'finished' };
					},
					statusLists: { signBitstringProof: async () => 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ4In0.c2ln' },
				}),
		}) as any;
	const lists = (written: any[]) =>
		new CredoStatusLists({
			store: { isDidOwned: async () => true, findPayerAccount: async () => ({ address: 'cheqd1x', kid: 'k' }) },
			runtime: { ...runtime(written) },
			withPayerLock: (_a, work) => work(),
			ensureTenant: async () => 'tenant',
			safeFetch: async () => {
				throw new Error('no network');
			},
			resolverUrl: RESOLVER,
		});
	const owner = { customerId: 'c' } as never;

	it('a StatusList2021 list created by Credo is read and revoked by the plugin, bit for bit', async () => {
		const written: any[] = [];
		await lists(written).createUnencryptedStatusList2021(
			DID,
			{ name: 'made-by-credo', resourceType: 'x', version: '1.0' },
			{ length: 140000, statusPurpose: 'revocation', encoding: 'base64url' },
			owner
		);
		const content = JSON.parse(Buffer.from(written[0].data).toString());
		const { StatusList } = await import('@digitalbazaar/vc-status-list');
		const decoded = await StatusList.decode({ encodedList: content.StatusList2021.encodedList });
		assert.equal(decoded.length, 140000);
		assert.equal(decoded.getStatus(10), false);
		// the plugin's own revoke on that list
		const input: Input = { label: 'credo-made', type: 'StatusList2021Revocation', name: 'made-by-credo', content };
		const veramo = await veramoRun(input, 'revoke', [10, 11]);
		const after = JSON.parse(Buffer.from(veramo.captured[0].data).toString());
		const bits = await StatusList.decode({ encodedList: after.StatusList2021.encodedList });
		assert.equal(bits.getStatus(10), true);
		assert.equal(bits.getStatus(12), false);
		// and the plugin's own check of a Credo-written entry
		assert.deepEqual(Object.keys(after.StatusList2021), ['statusPurpose', 'encodedList', 'validFrom']);
	});

	it('a Bitstring list created by Credo passes the plugin validator and the plugin can update it', async () => {
		const written: any[] = [];
		await lists(written).createUnencryptedBitstringStatusList(
			DID,
			{ name: 'bits-by-credo', resourceType: 'x', version: '1.0' },
			{ statusPurpose: 'message', size: 2, length: 131072 },
			owner
		);
		const content = JSON.parse(Buffer.from(written[0].data).toString());
		assert.equal(content.bitstringStatusListCredential.proof.type, 'JwtProof2020');
		// the plugin's validator on a Credo-written list
		const entry = {
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListIndex: '5',
			statusSize: 2,
			statusListCredential: 'x',
			statusMessage: content.metadata.statusMessages,
		};
		const check = await (Cheqd as any).validateBitstringStatus(entry, content, {
			fetchList: true,
			topArgs: { dkgOptions: {}, fetchList: true },
		});
		assert.deepEqual(check, { status: 0, purpose: 'message', valid: true, message: 'issued' });
		// the plugin's update on it, then Credo's decode of the plugin's output
		const input: Input = {
			label: 'credo-made',
			type: 'BitstringStatusListCredential',
			name: 'bits-by-credo',
			content,
		};
		const veramo = await veramoRun(input, 'revoke', [5]);
		const after = JSON.parse(Buffer.from(veramo.captured[0].data).toString());
		const bits = decodeBitstring(after.bitstringStatusListCredential.credentialSubject.encodedList);
		assert.equal(getBitstringStatus(bits, 5, 2), 1);
		const roundTrip = await (Cheqd as any).validateBitstringStatus({ ...entry, statusListIndex: '5' }, after, {
			fetchList: true,
			topArgs: { dkgOptions: {}, fetchList: true },
		});
		assert.deepEqual(roundTrip, { status: 1, purpose: 'message', valid: false, message: 'revoked' });
	});
});
