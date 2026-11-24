import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import { createTestDatabase, type TestDatabase } from './helpers/credo-database.js';

/**
 * Gate T3 (interop vectors, status lists): what Veramo wrote, read and checked by the Credo engine, through a real
 * Postgres, a real Credo agent with tenants and the real cheqd TESTNET (read only: nothing here writes or pays).
 * Needs network access to the public testnet RPC and resolver.
 *
 *   docker run -d --rm --name credo-status-db -e POSTGRES_PASSWORD=postgres -p 54338:5432 postgres:16
 *   CREDO_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54338/postgres \
 *     npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/credo-status-lists.test.ts
 *
 * Writes to testnet (and the Credo-writes, Veramo-reads half over the wire) are in `credo-status-lists-live.test.ts`.
 */
const adminUrl = process.env.CREDO_TEST_DATABASE_URL;
const skip = adminUrl ? false : 'set CREDO_TEST_DATABASE_URL to run (see the comment at the top of this file)';
const RPC = process.env.CREDO_LIVE_TESTNET_RPC_URL || 'https://rpc.cheqd.network:443';
const RESOLVER = process.env.CREDO_LIVE_RESOLVER_URL || 'https://resolver.cheqd.net/1.0/identifiers/';
const KNOWN_DID = 'did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA';
// A Token Status List the credo-ts live write test published to testnet on 11 Nov 2026 (P-256 did, ES256)
const TSL_DID = 'did:cheqd:testnet:e5a17991-a8e9-434f-a4b5-6aa006e9793f';

const contract = (name: string) =>
	JSON.parse(readFileSync(fileURLToPath(new URL(`../contract/fixtures/${name}.json`, import.meta.url)), 'utf8'))
		.exchange;

describe('CredoEngine reads lists written by Veramo (testnet)', { skip }, () => {
	let db: TestDatabase;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically by the helper
	let studio: any;
	const alice = { customerId: randomUUID() } as never;
	const bob = { customerId: randomUUID() } as never;

	before(async () => {
		db = await createTestDatabase(adminUrl as string, { rpcUrl: RPC });
		process.env.RESOLVER_URL = RESOLVER;
		studio = db.studio;
		await db.insertCustomer((alice as { customerId: string }).customerId, 'alice');
		await db.insertCustomer((bob as { customerId: string }).customerId, 'bob');
		// alice owns the DID the contract suite's lists live under (as an imported identifier would be)
		const store = new studio.TypeOrmCredoEngineStore(studio.Connection.instance.dbConnection, {
			getKey: async () => null,
		});
		await store.saveIdentifier((alice as { customerId: string }).customerId, {
			did: KNOWN_DID,
			provider: 'did:cheqd:testnet',
			keyIds: [],
			services: [],
		});
	});

	after(async () => {
		await db?.teardown();
	});

	const resolverJson = async (didUrl: string, accept?: string) =>
		(await fetch(`${RESOLVER}${didUrl}`, accept ? { headers: { accept } } : undefined)).json() as Promise<any>;

	it('searchStatusList returns the list and the resolver-shaped metadata the recorded Veramo response has', async () => {
		const recorded = contract('credential-status-search-found').response.body;
		const found = await studio.engine.searchStatusList(
			KNOWN_DID,
			'testingStatusList',
			'StatusList2021',
			'revocation'
		);
		assert.equal(found.found, true);
		// same keys as the recorded Veramo baseline, in the resolver's names
		assert.deepEqual(Object.keys(found.resourceMetadata).sort(), Object.keys(recorded.resourceMetadata).sort());
		assert.deepEqual(Object.keys(found.resource).sort(), Object.keys(recorded.resource).sort());
		assert.equal(found.resourceMetadata.mediaType, 'application/json');
		assert.equal(found.resourceMetadata.nextVersionId, null);
		assert.equal(found.resourceMetadata.previousVersionId, null);
		assert.equal(found.resourceMetadata.resourceType, 'StatusList2021Revocation');

		// and the values are exactly what the public resolver says about the same version
		const viaResolver = await resolverJson(
			`${KNOWN_DID}?resourceName=testingStatusList&resourceType=StatusList2021Revocation&resourceMetadata=true`,
			'application/ld+json;profile=https://w3id.org/did-resolution'
		);
		const latest = viaResolver.didDocumentMetadata?.linkedResourceMetadata?.find((r: any) => !r.nextVersionId);
		assert.ok(latest, 'resolver answered with the version list');
		assert.deepEqual(found.resourceMetadata, latest);
		assert.deepEqual(
			found.resource,
			await resolverJson(`${KNOWN_DID}?resourceName=testingStatusList&resourceType=StatusList2021Revocation`)
		);
	});

	for (const [purpose, resourceType] of [
		['revocation', 'StatusList2021Revocation'],
		['suspension', 'StatusList2021Suspension'],
	] as const) {
		it(`checkStatusList2021 agrees with the vc-status-list decoder on a real populated ${purpose} list (testingstatuslist)`, async () => {
			const published = (await resolverJson(
				`${KNOWN_DID}?resourceName=testingstatuslist&resourceType=${resourceType}`
			)) as any;
			const { StatusList } = await import('@digitalbazaar/vc-status-list');
			const list = await StatusList.decode({ encodedList: published.StatusList2021.encodedList });
			const set: number[] = [];
			for (let i = 0; i < list.length && set.length < 5; i++) if (list.getStatus(i)) set.push(i);
			console.log(`  testingstatuslist ${purpose}: ${set.length} of the first entries set, first ${set[0]}`);
			const key = purpose === 'revocation' ? 'revoked' : 'suspended';
			for (const index of [...set, 0, 1, 77, 139999]) {
				const mine = await studio.engine.checkStatusList2021(
					KNOWN_DID,
					{ statusListName: 'testingstatuslist', statusListIndex: index, statusPurpose: purpose },
					alice
				);
				assert.deepEqual(mine, { [key]: list.getStatus(index) }, `index ${index}`);
			}
		});
	}

	it('searchStatusList reports a list that does not exist as notFound, and needs no customer', async () => {
		assert.deepEqual(
			await studio.engine.searchStatusList(KNOWN_DID, 'no-such-list', 'StatusList2021', 'revocation'),
			{
				found: false,
				error: 'notFound',
			}
		);
	});

	it('checkStatusList2021 answers the recorded Veramo response for the contract list', async () => {
		const recorded = contract('credential-status-check');
		const result = await studio.engine.checkStatusList2021(
			KNOWN_DID,
			{
				statusListName: recorded.request.body.statusListName,
				statusListIndex: recorded.request.body.index,
				statusPurpose: recorded.request.query.statusPurpose,
			},
			alice
		);
		assert.deepEqual(result, recorded.response.body);
	});

	it('refuses a customer who does not own the DID, before reading anything', async () => {
		await assert.rejects(
			studio.engine.checkStatusList2021(
				KNOWN_DID,
				{ statusListName: 'testingStatusList', statusListIndex: 10, statusPurpose: 'revocation' },
				bob
			),
			/not found in wallet/
		);
		await assert.rejects(
			studio.engine.updateUnencryptedStatusList(
				KNOWN_DID,
				'StatusList2021',
				{ indices: [1], statusListName: 'testingStatusList', statusAction: 1 },
				bob
			),
			/not found in wallet/
		);
		await assert.rejects(
			studio.engine.createUnencryptedStatusList2021(KNOWN_DID, { name: 'x', resourceType: 'x' }, {}, bob),
			/not found in wallet/
		);
		// and nothing was locked or paid for
		await assert.rejects(
			studio.engine.updateUnencryptedStatusList(
				KNOWN_DID,
				'StatusList2021',
				{ indices: [1], statusListName: 'testingStatusList', statusAction: 1 },
				alice
			),
			/no fee payer|payment account/i
		);
	});

	for (const [name, label] of [
		['employee-credentials', '2 bit'],
		['ssasaa', '1 bit'],
	] as const) {
		it(`checkBitstringStatusList on the real ${label} list "${name}" matches the plugin's validator for every index it sets`, async () => {
			const url = `${RESOLVER}${KNOWN_DID}?resourceName=${name}&resourceType=BitstringStatusListCredential`;
			const published = (await (await fetch(url, { headers: { accept: 'application/json' } })).json()) as any;
			const size = published.metadata.statusSize;
			// probe the first 3,000 entries with both implementations
			const { decodeBitstring, getBitstringStatus } = await import('@credo-ts/cheqd');
			const bits = decodeBitstring(published.bitstringStatusListCredential.credentialSubject.encodedList);
			const setIndices: number[] = [];
			for (let i = 0; i < (bits.length * 8) / size; i++)
				if (getBitstringStatus(bits, i, size) !== 0) setIndices.push(i);
			const indices = [...new Set([...Array.from({ length: 1000 }, (_, i) => i), ...setIndices.slice(0, 2000)])];
			const entry = {
				type: 'BitstringStatusListEntry',
				statusPurpose: [published.bitstringStatusListCredential.credentialSubject.statusPurpose].flat()[0],
				statusListCredential: url,
				statusSize: size,
				statusMessage: published.metadata.statusMessages,
				statusListIndices: indices,
			};
			const theirs = await (Cheqd as any).bulkValidateBitstringStatuses(entry, published, {
				fetchList: true,
				topArgs: { dkgOptions: {}, fetchList: true },
			});
			const mine = await studio.engine.checkBitstringStatusList(KNOWN_DID, entry, alice);
			assert.equal(mine.length, theirs.length);
			assert.deepEqual(mine, theirs);
			const set = mine.filter((r: any) => r.status !== 0).length;
			console.log(
				`  ${name}: ${mine.length} entries compared, ${set} set (${setIndices.length} set on the list)`
			);
			// a single entry takes the single-result shape
			const single = await studio.engine.checkBitstringStatusList(
				KNOWN_DID,
				{ ...entry, statusListIndices: undefined, statusListIndex: '7' },
				alice
			);
			assert.deepEqual(
				single,
				await (Cheqd as any).validateBitstringStatus(
					{ ...entry, statusListIndices: undefined, statusListIndex: '7' },
					published,
					{ fetchList: true, topArgs: { dkgOptions: {}, fetchList: true } }
				)
			);
		});
	}

	it('reads a real Token Status List from the ledger, verifies its ES256 signature against the DID, and fails closed on bad input', async () => {
		const uri = `${RESOLVER}${TSL_DID}?resourceName=live-status-list&resourceType=TokenStatusList`;
		const reading = await studio.engine.getTokenStatus(uri, 0);
		assert.deepEqual(reading, { status: 0, verified: true });
		// out of range, wrong name, wrong DID, non-cheqd host that does not exist: all unverified, none throws
		assert.equal((await studio.engine.getTokenStatus(uri, 99999999)).verified, false);
		assert.equal((await studio.engine.getTokenStatus(uri.replace('live-status-list', 'nope'), 0)).verified, false);
		assert.equal((await studio.engine.getTokenStatus('https://127.0.0.1/list', 0)).verified, false);
		assert.equal((await studio.engine.getTokenStatus('http://lists.example/list', 0)).verified, false);
		assert.equal(
			(await studio.engine.getTokenStatus('https://169.254.169.254/latest/meta-data/', 0)).verified,
			false
		);
	});

	it('the real safeFetch reaches a public host and refuses internal destinations without connecting', async () => {
		const { safeFetch } = await import('../../src/helpers/safe-fetch.js');
		const ok = await safeFetch(
			`${RESOLVER}${KNOWN_DID}?resourceName=testingStatusList&resourceType=StatusList2021Revocation`
		);
		assert.equal(ok.status, 200);
		assert.ok(JSON.parse(new TextDecoder().decode(ok.body)).StatusList2021);
		for (const url of [
			'https://127.0.0.1/',
			'https://localhost/',
			'https://169.254.169.254/',
			'https://[::1]/',
			'https://10.0.0.1/',
			'http://resolver.cheqd.net/',
		]) {
			await assert.rejects(
				safeFetch(url),
				{ name: 'SafeFetchError', message: 'The remote resource could not be fetched' },
				url
			);
		}
		await assert.rejects(safeFetch(`${RESOLVER}${KNOWN_DID}`, { maxBytes: 100 }), { code: 'too-large' });
		await assert.rejects(safeFetch(`${RESOLVER}${KNOWN_DID}`, { timeoutMs: 1 }), { code: 'timeout' });
	});
});
