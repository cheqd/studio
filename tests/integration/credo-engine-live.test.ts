import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from './helpers/credo-database.js';

/**
 * OPT-IN live test: creates, updates and deactivates a did:cheqd on the cheqd TESTNET through the Credo engine, with
 * the customer's own payment account paying the fees. It spends testnet CHEQ. It is skipped unless all of these are
 * set, and it never prints or writes the key:
 *
 *   CREDO_TEST_DATABASE_URL         superuser URL of a disposable Postgres (as for credo-engine.test.ts)
 *   CREDO_LIVE_PAYER_PRIVATE_KEY    64 hex characters: the private key of a FUNDED testnet account (secp256k1)
 *   CREDO_LIVE_TESTNET_RPC_URL      optional, defaults to https://rpc.cheqd.network:443
 *   CREDO_LIVE_RESOLVER_URL         optional, defaults to https://resolver.cheqd.net/1.0/identifiers
 *
 *   npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/credo-engine-live.test.ts
 *
 * What it proves, in order: the payer is read from the customer's payment account (not from configuration), the
 * default identifier (P-256 JsonWebKey plus Ed25519 Multikey) is created on the ledger, an update adds a service, a
 * deactivation marks the DID deactivated, and a second customer can do none of it.
 */
const adminUrl = process.env.CREDO_TEST_DATABASE_URL;
const payerKey = process.env.CREDO_LIVE_PAYER_PRIVATE_KEY;
const skip =
	adminUrl && payerKey ? false : 'set CREDO_TEST_DATABASE_URL and CREDO_LIVE_PAYER_PRIVATE_KEY to run this live test';
const rpcUrl = process.env.CREDO_LIVE_TESTNET_RPC_URL || 'https://rpc.cheqd.network:443';
const resolverUrl = process.env.CREDO_LIVE_RESOLVER_URL || 'https://resolver.cheqd.net/1.0/identifiers';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('CredoEngine on cheqd testnet (live)', { skip }, () => {
	let db: TestDatabase;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically by the helper
	let studio: any;
	const alice = { customerId: randomUUID() } as never;
	const bob = { customerId: randomUUID() } as never;
	let did = '';

	/** The resolver answers a moment after the transaction lands; poll until `accept` is satisfied. */
	// biome-ignore lint/suspicious/noExplicitAny: resolution results are plain JSON
	async function resolveUntil(accept: (result: any) => boolean): Promise<any> {
		let last;
		for (let attempt = 0; attempt < 30; attempt++) {
			last = await studio.engine.resolveDid(did);
			if (accept(last)) return last;
			await pause(2000);
		}
		assert.fail(
			`the resolver did not reach the expected state for ${did}: ${JSON.stringify(last?.didDocumentMetadata)}`
		);
	}

	before(async () => {
		db = await createTestDatabase(adminUrl as string, { rpcUrl });
		process.env.RESOLVER_URL = resolverUrl;
		studio = db.studio;
		await db.insertCustomer((alice as { customerId: string }).customerId, 'alice');
		await db.insertCustomer((bob as { customerId: string }).customerId, 'bob');

		// Give alice the funded account as her testnet payment account, through the same tables Studio uses: the key in
		// Veramo's private key table, the account in `paymentAccount`. The engine reads it back from there.
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
		// The address is not a secret: print it so an operator knows which account pays
		console.log(`live test payer account: ${account.address}`);
	});

	after(async () => {
		await db?.teardown();
	});

	it('creates the default identifier on testnet, paid by the customer’s account', async () => {
		const identifier = await studio.engine.createDid('testnet', { id: '' }, alice);
		did = identifier.did;
		assert.match(did, /^did:cheqd:testnet:[0-9a-f-]{36}$/);
		assert.equal(identifier.provider, 'did:cheqd:testnet');

		const resolved = await resolveUntil((r) => r.didDocument?.id === did);
		const types = resolved.didDocument.verificationMethod.map((vm: { type: string }) => vm.type).sort();
		assert.deepEqual(types, ['Ed25519VerificationKey2020', 'JsonWebKey2020']);
		assert.equal(resolved.didDocument.authentication.length, 2);
		assert.ok(await studio.engine.didExists(did, alice));
	});

	it('updates it: adds a service endpoint', async () => {
		assert.ok(did, 'the first test must create the DID');
		const before = await studio.engine.resolveDid(did);
		const document = {
			...before.didDocument,
			service: [{ id: `${did}#agent`, type: 'LinkedDomains', serviceEndpoint: ['https://example.com'] }],
		};
		const updated = await studio.engine.updateDid(document, alice);
		assert.equal(updated.did, did);

		const after = await resolveUntil((r) =>
			(r.didDocument?.service ?? []).some((s: { id: string }) => s.id === `${did}#agent`)
		);
		assert.notEqual(after.didDocumentMetadata.versionId, before.didDocumentMetadata.versionId);
	});

	it('refuses a second customer the DID and the payer of the first', async () => {
		assert.ok(did, 'the first test must create the DID');
		const document = (await studio.engine.resolveDid(did)).didDocument;
		await assert.rejects(studio.engine.updateDid(document, bob), /not found in wallet/);
		await assert.rejects(studio.engine.deactivateDid(did, bob), /not found in wallet/);
		// Bob has no payment account, so even a fresh DID of his own cannot be paid for
		await assert.rejects(studio.engine.createDid('testnet', { id: '' }, bob), /no fee payer/);
	});

	it('deactivates it', async () => {
		assert.ok(did, 'the first test must create the DID');
		assert.equal(await studio.engine.deactivateDid(did, alice), true);
		await resolveUntil((r) => r.didDocumentMetadata?.deactivated === true);
		// A second deactivation is a no-op that still answers true
		assert.equal(await studio.engine.deactivateDid(did, alice), true);
	});
});
