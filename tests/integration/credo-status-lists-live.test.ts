import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomUUID } from 'node:crypto';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import { createTestDatabase, type TestDatabase } from './helpers/credo-database.js';

/**
 * OPT-IN live test: writes status lists to the cheqd TESTNET through the Credo engine, paid by the customer's own
 * payment account, and reads them back through the public resolver with the Veramo plugin's own validators (gate T3,
 * Credo writes and Veramo reads). It spends testnet CHEQ. Skipped unless both are set; the key is never printed:
 *
 *   CREDO_TEST_DATABASE_URL         superuser URL of a disposable Postgres (as for credo-engine.test.ts)
 *   CREDO_LIVE_PAYER_PRIVATE_KEY    64 hex characters: the private key of a FUNDED testnet account (secp256k1)
 *   CREDO_LIVE_TESTNET_RPC_URL      optional, defaults to https://rpc.cheqd.network:443
 *   CREDO_LIVE_RESOLVER_URL         optional, defaults to https://resolver.cheqd.net/1.0/identifiers/
 *
 *   npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/credo-status-lists-live.test.ts
 *
 * Costs roughly USD 2 for the DID and 0.40 for each list version (about 9 transactions). NOT RUN by the author of
 * this file: no funded payer was available.
 */
const adminUrl = process.env.CREDO_TEST_DATABASE_URL;
const payerKey = process.env.CREDO_LIVE_PAYER_PRIVATE_KEY;
const skip =
	adminUrl && payerKey ? false : 'set CREDO_TEST_DATABASE_URL and CREDO_LIVE_PAYER_PRIVATE_KEY to run this live test';
const rpcUrl = process.env.CREDO_LIVE_TESTNET_RPC_URL || 'https://rpc.cheqd.network:443';
const resolverUrl = process.env.CREDO_LIVE_RESOLVER_URL || 'https://resolver.cheqd.net/1.0/identifiers/';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Credo status lists on cheqd testnet (live)', { skip }, () => {
	let db: TestDatabase;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically by the helper
	let studio: any;
	const alice = { customerId: randomUUID() } as never;
	const bob = { customerId: randomUUID() } as never;
	let did = '';
	const run = randomUUID().slice(0, 8);

	/** The public resolver answers a moment after the transaction lands. */
	// biome-ignore lint/suspicious/noExplicitAny: resolver bodies are plain JSON
	async function resolverJson(name: string, type: string, accept: (body: any) => boolean): Promise<any> {
		// biome-ignore lint/suspicious/noExplicitAny: ditto
		let last: any;
		for (let attempt = 0; attempt < 30; attempt++) {
			const response = await fetch(`${resolverUrl}${did}?resourceName=${name}&resourceType=${type}`);
			if (response.ok) {
				last = await response.json();
				if (accept(last)) return last;
			}
			await pause(2000);
		}
		assert.fail(`the resolver did not serve ${name} in the expected state: ${JSON.stringify(last)?.slice(0, 200)}`);
	}

	before(async () => {
		db = await createTestDatabase(adminUrl as string, { rpcUrl });
		process.env.RESOLVER_URL = resolverUrl;
		studio = db.studio;
		await db.insertCustomer((alice as { customerId: string }).customerId, 'alice');
		await db.insertCustomer((bob as { customerId: string }).customerId, 'bob');
		const privateKeyHex = (payerKey as string).replace(/^0x/, '');
		assert.match(privateKeyHex, /^[0-9a-f]{64}$/i, 'CREDO_LIVE_PAYER_PRIVATE_KEY must be 64 hex characters');
		const ecdh = createECDH('secp256k1');
		ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'));
		const kid = ecdh.getPublicKey(undefined, 'compressed').toString('hex');
		const store = new studio.PrivateKeyStore(
			studio.Connection.instance.dbConnection,
			new studio.SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY)
		);
		await store.importKey({ alias: kid, type: 'Secp256k1', privateKeyHex });
		const key = new studio.KeyEntity(kid, 'Secp256k1', kid);
		key.kms = 'postgres';
		key.customer = alice;
		await studio.Connection.instance.dbConnection.getRepository(studio.KeyEntity).insert(key);
		const account = await studio.PaymentAccountService.instance.create('testnet', true, alice, key);
		console.log(`live test payer account: ${account.address}`);
		did = (await studio.engine.createDid('testnet', { id: '' }, alice)).did;
	});

	after(async () => {
		await db?.teardown();
	});

	it('creates, revokes and checks a StatusList2021 list; the plugin decodes what Credo wrote', async () => {
		const created = await studio.engine.createUnencryptedStatusList2021(
			did,
			{ name: `sl-${run}`, resourceType: 'StatusList2021Revocation', version: '1.0' },
			{ length: 140000, statusPurpose: 'revocation', encoding: 'base64url' },
			alice
		);
		assert.equal(created.created, true);
		assert.equal(created.resourceMetadata.resourceVersion, '1.0');
		const { StatusList } = await import('@digitalbazaar/vc-status-list');
		const first = await resolverJson(`sl-${run}`, 'StatusList2021Revocation', (b) => !!b.StatusList2021);
		assert.equal((await StatusList.decode({ encodedList: first.StatusList2021.encodedList })).length, 140000);

		const updated = await studio.engine.updateUnencryptedStatusList(
			did,
			'StatusList2021',
			{ indices: [3, 4], statusListName: `sl-${run}`, statusAction: 1 },
			alice
		);
		assert.deepEqual(updated.revoked, [true, true]);
		const second = await resolverJson(
			`sl-${run}`,
			'StatusList2021Revocation',
			(b) => b.StatusList2021.encodedList !== first.StatusList2021.encodedList
		);
		const decoded = await StatusList.decode({ encodedList: second.StatusList2021.encodedList });
		assert.deepEqual(
			[2, 3, 4, 5].map((i) => decoded.getStatus(i)),
			[false, true, true, false]
		);
		assert.deepEqual(
			await studio.engine.checkStatusList2021(
				did,
				{ statusListName: `sl-${run}`, statusListIndex: 3, statusPurpose: 'revocation' },
				alice
			),
			{ revoked: true }
		);
	});

	it('creates and revokes on a Bitstring list; the plugin validator accepts it and sees the revocation', async () => {
		const created = await studio.engine.createUnencryptedBitstringStatusList(
			did,
			{ name: `bits-${run}`, resourceType: 'BitstringStatusListCredential', version: '1.0' },
			{ statusPurpose: 'message', size: 2 },
			alice
		);
		assert.equal(created.created, true);
		await studio.engine.updateUnencryptedStatusList(
			did,
			'BitstringStatusList',
			{ indices: [9], statusListName: `bits-${run}`, statusAction: 1 },
			alice
		);
		const url = `${resolverUrl}${did}?resourceName=bits-${run}&resourceType=BitstringStatusListCredential`;
		const published = await resolverJson(
			`bits-${run}`,
			'BitstringStatusListCredential',
			(b) => !!b.bitstringStatusListCredential
		);
		const entry = {
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListIndex: '9',
			statusSize: 2,
			statusListCredential: url,
			statusMessage: published.metadata.statusMessages,
		};
		const theirs = await (Cheqd as any).validateBitstringStatus(entry, published, {
			fetchList: true,
			topArgs: { dkgOptions: {}, fetchList: true },
		});
		const mine = await studio.engine.checkBitstringStatusList(did, entry, alice);
		assert.deepEqual(mine, theirs);
	});

	it('creates a Token Status List, sets a status and reads it back verified', async () => {
		const list = await studio.engine.createTokenStatusList(did, { name: `tsl-${run}`, bits: 2, size: 1024 }, alice);
		assert.match(list.uri, new RegExp(`resourceName=tsl-${run}&resourceType=TokenStatusList$`));
		await studio.engine.setTokenStatus(did, list.uri, [{ index: 5, status: 1 }], alice);
		let reading;
		for (let attempt = 0; attempt < 20; attempt++) {
			reading = await studio.engine.getTokenStatus(list.uri, 5);
			if (reading.verified && reading.status === 1) break;
			await pause(2000);
		}
		assert.deepEqual(reading, { status: 1, verified: true });
		assert.deepEqual(await studio.engine.getTokenStatus(list.uri, 6), { status: 0, verified: true });
	});

	it('refuses a second customer every one of those', async () => {
		await assert.rejects(
			studio.engine.updateUnencryptedStatusList(
				did,
				'StatusList2021',
				{ indices: [1], statusListName: `sl-${run}`, statusAction: 1 },
				bob
			),
			/not found in wallet/
		);
		await assert.rejects(studio.engine.createTokenStatusList(did, { name: 'x' }, bob), /not found in wallet/);
		await assert.rejects(
			studio.engine.setTokenStatus(
				did,
				`${resolverUrl}${did}?resourceName=tsl-${run}&resourceType=TokenStatusList`,
				[{ index: 1, status: 1 }],
				bob
			),
			/not found in wallet/
		);
	});
});
