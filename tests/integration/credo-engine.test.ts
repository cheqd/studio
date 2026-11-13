import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
	createTestDatabase,
	FAKE_STORE_KEY,
	OTHER_FAKE_STORE_KEY,
	type TestDatabase,
} from './helpers/credo-database.js';

/**
 * Integration test for the Credo engine against a real Postgres, real migrations, a real Askar store and a real
 * Credo agent with tenants. Only the cheqd ledger is absent: nothing here broadcasts a transaction.
 *
 * It uses Node's test runner, not jest (the controller stack and Credo's ESM packages do not mix under jest's VM
 * modules), and lives outside `tests/unit`, so `npm run test:unit` never picks it up. Run it against a disposable
 * Postgres 16 on port 54335:
 *
 *   docker run -d --rm --name credo-it-db -e POSTGRES_PASSWORD=postgres -p 54335:5432 postgres:16
 *   CREDO_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54335/postgres \
 *     npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/credo-engine.test.ts
 *
 * The hook in `hooks/` points `webcrypto-core` at its CommonJS build, which tsx needs to load Credo.
 *
 * Without CREDO_TEST_DATABASE_URL the suite is skipped. It creates its own Studio database, Credo's `studio_credo`
 * database and the `studio_credo_app` role (what docs/credo-database-provisioning.md does by hand), and drops them
 * when it finishes. The URL must be a superuser (it creates databases and a role), and the cluster must not hold
 * a database called `studio_credo` that matters: it is dropped.
 */
const adminUrl = process.env.CREDO_TEST_DATABASE_URL;
const skip = adminUrl ? false : 'set CREDO_TEST_DATABASE_URL to run (see the comment at the top of this file)';

describe('CredoEngine on Postgres', { skip }, () => {
	let db: TestDatabase;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically by the helper
	let studio: any;
	const customers = { alice: randomUUID(), bob: randomUUID() };

	before(async () => {
		db = await createTestDatabase(adminUrl as string);
		studio = db.studio;
		for (const [name, customerId] of Object.entries(customers)) await db.insertCustomer(customerId, name);
	});

	after(async () => {
		await db?.teardown();
	});

	const customer = (name: keyof typeof customers) => ({ customerId: customers[name] }) as never;
	const query = <T = Record<string, unknown>>(sql: string, parameters: unknown[] = []): Promise<T[]> =>
		db.query<T>(sql, parameters);

	it('creates no tenant until the first operation, then creates exactly one and records it', async () => {
		assert.equal(
			(await query(`SELECT "credoTenantId" FROM "customer" WHERE "customerId" = $1`, [customers.alice]))[0]
				.credoTenantId,
			null
		);

		const key = await studio.engine.createKey('Secp256r1', customer('alice'), 'first');
		assert.ok(key.kid);

		const [{ credoTenantId }] = await query<{ credoTenantId: string }>(
			`SELECT "credoTenantId" FROM "customer" WHERE "customerId" = $1`,
			[customers.alice]
		);
		assert.ok(credoTenantId, 'the tenant id is recorded against the customer');

		// Later calls, and a race of first calls for another customer, reuse or create exactly one tenant each
		await studio.engine.createKey('Ed25519', customer('alice'));
		const [bobA, bobB, bobC] = await Promise.all([
			studio.engine.ensureTenant(customers.bob),
			studio.engine.ensureTenant(customers.bob),
			studio.engine.ensureTenant(customers.bob),
		]);
		assert.equal(bobA, bobB);
		assert.equal(bobB, bobC);

		const rows = await query<{ customerId: string; credoTenantId: string }>(
			`SELECT "customerId", "credoTenantId" FROM "customer" WHERE "credoTenantId" IS NOT NULL ORDER BY "name"`
		);
		assert.equal(rows.length, 2);
		assert.equal(rows[0].credoTenantId, credoTenantId);
		assert.notEqual(rows[0].credoTenantId, rows[1].credoTenantId);
	});

	it('keeps Credo storage in its own database, under the app role, and nothing of it in Studio’s', async () => {
		const tablesIn = async (database: string) =>
			(
				await db.adminQuery<{ table_schema: string; table_name: string }>(
					`SELECT table_schema, table_name FROM information_schema.tables
					 WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2`,
					database
				)
			).map((row) => `${row.table_schema}.${row.table_name}`);

		// Askar names its schema after the connecting role
		const credoTables = await tablesIn(db.credoDatabase);
		for (const table of ['config', 'items', 'items_tags', 'profiles']) {
			assert.ok(
				credoTables.includes(`studio_credo_app.${table}`),
				`studio_credo_app.${table} exists in ${db.credoDatabase}`
			);
		}

		// Nothing of Askar's in Studio's own database, and no `credo` schema there either
		const studioTables = await tablesIn(db.databaseName);
		for (const table of ['config', 'items', 'items_tags', 'profiles']) {
			assert.ok(
				!studioTables.some((name) => name.endsWith(`.${table}`)),
				`${table} must not exist in Studio's database`
			);
		}
		const [{ schemas }] = await query<{ schemas: string }>(
			`SELECT count(*) AS schemas FROM information_schema.schemata WHERE schema_name = 'credo'`
		);
		assert.equal(Number(schemas), 0, 'Studio’s database has no credo schema');

		// One profile for the root agent and one per tenant, and the tenant records are stored
		const [{ count }] = await db.adminQuery<{ count: string }>(`SELECT count(*) FROM studio_credo_app.profiles`);
		assert.ok(Number(count) >= 3, `expected a root profile and two tenant profiles, found ${count}`);
		const [{ items }] = await db.adminQuery<{ items: string }>(
			`SELECT count(*) AS items FROM studio_credo_app.items`
		);
		assert.ok(Number(items) > 0);

		// The store was provisioned by the runtime with the app role only: the role has no admin rights
		const [role] = await db.adminQuery<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
			`SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'studio_credo_app'`,
			'postgres'
		);
		assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
	});

	it('keeps no key material in Askar: signing keys are only in Studio’s private-key table', async () => {
		const key = await studio.engine.createKey('Ed25519', customer('alice'), 'not-in-askar');
		const [{ privateKeyHex }] = await query<{ privateKeyHex: string }>(
			`SELECT "privateKeyHex" FROM "private-key" WHERE "alias" = $1`,
			[key.kid]
		);
		assert.ok(privateKeyHex, 'the key is in Studio’s private-key table');

		// Askar encrypts categories and names, so look at the entry kind: 1 is a KMS key, 2 is an ordinary record
		const kinds = await db.adminQuery<{ kind: number; n: string }>(
			`SELECT kind, count(*) AS n FROM studio_credo_app.items GROUP BY kind`
		);
		assert.ok(
			kinds.some((row) => Number(row.kind) === 2),
			'Askar holds Credo’s records'
		);
		const keyItems = kinds.filter((row) => Number(row.kind) === 1);
		assert.deepEqual(keyItems, [], 'enableKms is false: Askar holds no key entries');
	});

	it('round-trips keys through the Veramo key store adapter', async () => {
		for (const type of ['Ed25519', 'Secp256r1', 'Secp256k1'] as const) {
			const key = await studio.engine.createKey(type, customer('alice'), `alias-${type}`);
			assert.equal(key.kid, key.publicKeyHex, 'the kid is the public key hex, as in Veramo');

			// Studio's `key` row, owned by the customer
			const [row] = await query<{ customerId: string; kms: string; type: string; publicKeyAlias: string }>(
				`SELECT "customerId", "kms", "type", "publicKeyAlias" FROM "key" WHERE "kid" = $1`,
				[key.kid]
			);
			assert.equal(row.customerId, customers.alice);
			assert.equal(row.kms, 'postgres');
			assert.equal(row.type, type);
			assert.equal(row.publicKeyAlias, `alias-${type}`);

			// The private key sits encrypted in Veramo's table, written by the Credo KMS through the adapter
			const [{ privateKeyHex }] = await query<{ privateKeyHex: string }>(
				`SELECT "privateKeyHex" FROM "private-key" WHERE "alias" = $1`,
				[key.kid]
			);
			assert.ok(privateKeyHex && !/^[0-9a-f]{64}$/.test(privateKeyHex), 'stored encrypted, not as plain hex');

			// Decrypt through Veramo's own store, convert with the adapter, and the public key matches
			const store = new studio.PrivateKeyStore(
				studio.Connection.instance.dbConnection,
				new studio.SecretBox('0'.repeat(64))
			);
			const stored = await store.getKey({ alias: key.kid });
			const jwk = studio.veramoKeyToJwk(stored.type, stored.privateKeyHex, key.kid);
			assert.equal(stored.type, type);
			assert.equal(jwk.kid, key.kid);

			// And Veramo's KMS can sign with the key Credo made
			const veramo = new studio.KeyManagementSystem(store);
			const signature = await veramo.sign({
				keyRef: { kid: key.kid },
				algorithm: type === 'Ed25519' ? 'EdDSA' : type === 'Secp256r1' ? 'ES256' : 'ES256K',
				data: new TextEncoder().encode('round trip'),
			});
			assert.ok(signature.length > 40);
		}
	});

	it('refuses a second customer every key and DID of the first, against the real tables', async () => {
		const aliceKey = await studio.engine.createKey('Ed25519', customer('alice'));
		const did = `did:cheqd:testnet:${randomUUID()}`;
		const store = new studio.TypeOrmCredoEngineStore(
			studio.Connection.instance.dbConnection,
			new studio.PrivateKeyStore(studio.Connection.instance.dbConnection, new studio.SecretBox('0'.repeat(64)))
		);
		await store.saveIdentifier(customers.alice, {
			did,
			provider: 'did:cheqd:testnet',
			controllerKeyId: aliceKey.kid,
			keyIds: [aliceKey.kid],
			services: [{ id: `${did}#s`, type: 'Test', serviceEndpoint: { uri: 'https://example.com' } }],
		});

		// Reads: counts and filtered rows only
		assert.equal(await studio.engine.didExists(did, customer('alice')), true);
		assert.equal(await studio.engine.didExists(did, customer('bob')), false);
		assert.equal(await studio.engine.getKey(aliceKey.kid, customer('bob')), null);
		assert.equal((await studio.engine.getKey(aliceKey.kid, customer('alice'))).kid, aliceKey.kid);
		assert.deepEqual((await studio.engine.listDids({}, customer('bob'))).dids, []);
		assert.ok((await studio.engine.listDids({}, customer('alice'))).dids.includes(did));
		const identifier = await studio.engine.getDid(did, customer('alice'));
		assert.equal(identifier.controllerKeyId, aliceKey.kid);
		assert.equal(identifier.keys[0].kid, aliceKey.kid);
		assert.equal(identifier.services[0].serviceEndpoint.uri, 'https://example.com');
		await assert.rejects(studio.engine.getDid(did, customer('bob')), /not found/);

		// Writes by the second customer
		await assert.rejects(studio.engine.updateDid({ id: did }, customer('bob')), /not found in wallet/);
		await assert.rejects(studio.engine.deactivateDid(did, customer('bob')), /not found in wallet/);
		await assert.rejects(
			studio.engine.createResource(
				'testnet',
				{ collectionId: did.split(':')[3], name: 'n', resourceType: 't', data: 'x' },
				customer('bob')
			),
			/not found in wallet/
		);
		await assert.rejects(
			store.insertOwnedKey(customers.bob, {
				kid: aliceKey.kid,
				type: 'Ed25519',
				publicKeyHex: aliceKey.publicKeyHex,
			}),
			/not found in wallet/
		);
		await assert.rejects(
			store.saveIdentifier(customers.bob, { did, provider: 'did:cheqd:testnet', keyIds: [], services: [] }),
			/not found in wallet/
		);
		const [{ customerId }] = await query<{ customerId: string }>(
			`SELECT "customerId" FROM "key" WHERE "kid" = $1`,
			[aliceKey.kid]
		);
		assert.equal(customerId, customers.alice, 'the key is still alice’s');

		// A DID document that names alice's key, submitted as bob, never reaches the ledger code
		const publicKeyBase58 = (await import('multiformats/basics')).bases.base58btc
			.encode(new Uint8Array(Buffer.from(aliceKey.publicKeyHex, 'hex')))
			.slice(1);
		const stolen = `did:cheqd:testnet:${randomUUID()}`;
		const document = {
			id: stolen,
			verificationMethod: [
				{ id: `${stolen}#key-1`, type: 'Ed25519VerificationKey2018', controller: stolen, publicKeyBase58 },
			],
			authentication: [`${stolen}#key-1`],
		};
		await studio.PaymentAccountService.instance.create(
			'testnet',
			true,
			{ customerId: customers.bob },
			await studio.engine.createKey('Secp256k1', customer('bob'))
		);
		await assert.rejects(
			studio.engine.createDid('testnet', document, customer('bob')),
			new RegExp(`Key ${aliceKey.publicKeyHex} not found in wallet`)
		);
	});

	it('resolves the payer from the customer’s own payment account, signs, and stops only at the missing ledger', async () => {
		const payerKey = await studio.engine.createKey('Secp256k1', customer('alice'));
		await studio.PaymentAccountService.instance.create('testnet', true, { customerId: customers.alice }, payerKey);

		// Alice has a payment account: the payer resolves, both new keys sign the document, and only the broadcast
		// fails because nothing listens on the RPC address
		const didsBefore = (await studio.engine.listDids({}, customer('alice'))).dids.length;
		const error: Error = await studio.engine.createDid('testnet', { id: '' }, customer('alice')).then(
			() => assert.fail('no ledger is reachable, so this cannot succeed'),
			(e: Error) => e
		);
		assert.doesNotMatch(error.message, /fee payer|payment account/i, `the payer must resolve: ${error.message}`);
		assert.match(error.message, /Failed to create did:cheqd:testnet:/);
		assert.match(error.message, /cheqd sdk|fetch failed|ECONNREFUSED|connect/i);

		// The two keys of the default identifier were created, as alice's, before the ledger step
		const keyTypes = await query<{ type: string }>(
			`SELECT "type" FROM "key" WHERE "customerId" = $1 AND "type" IN ('Secp256r1', 'Ed25519')`,
			[customers.alice]
		);
		assert.ok(keyTypes.length >= 2);
		// And nothing was recorded as a DID that never reached the ledger
		assert.equal((await studio.engine.listDids({}, customer('alice'))).dids.length, didsBefore);

		// Bob's account is on testnet too, but a customer without one is refused before anything is created
		const carol = randomUUID();
		await query(
			`INSERT INTO "customer" ("customerId", "name", "email", "createdAt") VALUES ($1, 'carol', $2, now())`,
			[carol, `carol-${carol}@example.invalid`]
		);
		await assert.rejects(studio.engine.createDid('testnet', { id: '' }, { customerId: carol }), /no fee payer/);
		const [{ credoTenantId }] = await query<{ credoTenantId: string | null }>(
			`SELECT "credoTenantId" FROM "customer" WHERE "customerId" = $1`,
			[carol]
		);
		assert.equal(credoTenantId, null, 'no tenant is made for a write that cannot be paid for');
	});

	it('the payer lock serialises writes per payer on the real database', async () => {
		const dataSource = studio.Connection.instance.dbConnection;
		const observer = new Client({ connectionString: process.env.EXTERNAL_DB_CONNECTION_URL });
		await observer.connect();
		try {
			const order: string[] = [];
			const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
			const write = (payer: string, name: string) =>
				studio.withPayerLock(dataSource, payer, async () => {
					order.push(`${name}:start`);
					if (name !== 'b1') {
						const held = await observer.query(
							`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted`
						);
						assert.ok(held.rows[0].n >= 1, 'an advisory lock is held while the write runs');
					}
					await pause(150);
					order.push(`${name}:end`);
				});

			await Promise.all([
				write('cheqd1lockpayer', 'a1'),
				write('cheqd1lockpayer', 'a2'),
				write('cheqd1otherpayer', 'b1'),
			]);

			// Whichever of the two same-payer writes got the lock first must finish before the other starts
			const [first, second] = order.indexOf('a1:start') < order.indexOf('a2:start') ? ['a1', 'a2'] : ['a2', 'a1'];
			assert.ok(
				order.indexOf(`${first}:end`) < order.indexOf(`${second}:start`),
				`same payer runs one at a time: ${order.join(' ')}`
			);
			assert.ok(
				order.indexOf('b1:start') < order.indexOf(`${first}:end`),
				`a different payer is not held up: ${order.join(' ')}`
			);

			// The lock is gone afterwards, and a failing write releases it too
			await assert.rejects(
				studio.withPayerLock(dataSource, 'cheqd1lockpayer', async () => {
					throw new Error('broadcast failed');
				}),
				/broadcast failed/
			);
			const after = await observer.query(
				`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted`
			);
			assert.equal(after.rows[0].n, 0);
		} finally {
			await observer.end();
		}
	});
	it('opens the existing store again with the same raw key, and sees the tenants it already holds', async () => {
		const [{ credoTenantId }] = await query<{ credoTenantId: string }>(
			`SELECT "credoTenantId" FROM "customer" WHERE "customerId" = $1`,
			[customers.alice]
		);
		const storage = studio.loadCredoStorageConfig();
		const runtime = await studio.createCredoRuntime({
			privateKeyStore: new studio.PrivateKeyStore(
				studio.Connection.instance.dbConnection,
				new studio.SecretBox('0'.repeat(64))
			),
			storage,
			networks: [{ network: 'testnet', rpcUrl: 'http://127.0.0.1:9' }],
			resolvePayer: async () => assert.fail('no payer is needed to reopen a store'),
			onKeyCreated: async () => assert.fail('no key is created'),
		});
		try {
			await runtime.withTenant(credoTenantId, async () => undefined);
		} finally {
			await runtime.shutdown();
		}
	});

	it('fails closed with a wrong store key, and leaves the store as it was', async () => {
		const before = await db.adminQuery<{ count: string }>(`SELECT count(*) FROM studio_credo_app.items`);
		const storage = {
			...studio.loadCredoStorageConfig(),
			storeKey: studio.parseStoreKey(OTHER_FAKE_STORE_KEY).key,
		};
		await assert.rejects(
			studio.createCredoRuntime({
				privateKeyStore: new studio.PrivateKeyStore(
					studio.Connection.instance.dbConnection,
					new studio.SecretBox('0'.repeat(64))
				),
				storage,
				networks: [{ network: 'testnet', rpcUrl: 'http://127.0.0.1:9' }],
				resolvePayer: async () => assert.fail('unreachable'),
				onKeyCreated: async () => assert.fail('unreachable'),
			})
		);
		const after = await db.adminQuery<{ count: string }>(`SELECT count(*) FROM studio_credo_app.items`);
		assert.equal(after[0].count, before[0].count, 'a wrong key must not provision or rewrite anything');
		const [{ profiles }] = await db.adminQuery<{ profiles: string }>(
			`SELECT count(*) AS profiles FROM studio_credo_app.profiles`
		);
		assert.ok(Number(profiles) >= 3);
	});

	it('fails the Credo engine with a configuration error, not a stack trace, when the store key is missing', async () => {
		const saved = process.env.CREDO_STORE_KEY;
		delete process.env.CREDO_STORE_KEY;
		try {
			// A fresh engine, so the runtime the other tests started is not reused
			const fresh = studio.createCredoEngine();
			const error: Error = await fresh.createKey('Ed25519', customer('alice')).then(
				() => assert.fail('must not run without the store key'),
				(e: Error) => e
			);
			assert.equal(error.name, 'CredoConfigurationError');
			assert.match(error.message, /CREDO_STORE_KEY is not set/);
			assert.doesNotMatch(error.stack ?? '', /\n\s+at /, 'no stack frames');
		} finally {
			process.env.CREDO_STORE_KEY = saved;
		}
		// Nothing was created in Credo's store by the refused call, and the engine works once the variable is back
		assert.ok((await studio.engine.createKey('Ed25519', customer('alice'))).kid);
	});

	it('reports a missing Credo database by name', async () => {
		const saved = process.env.CREDO_DB_NAME;
		process.env.CREDO_DB_NAME = 'studio_credo_does_not_exist';
		try {
			await assert.rejects(
				studio.createCredoRuntime({
					privateKeyStore: new studio.PrivateKeyStore(
						studio.Connection.instance.dbConnection,
						new studio.SecretBox('0'.repeat(64))
					),
					storage: studio.loadCredoStorageConfig(),
					networks: [{ network: 'testnet', rpcUrl: 'http://127.0.0.1:9' }],
					resolvePayer: async () => assert.fail('unreachable'),
					onKeyCreated: async () => assert.fail('unreachable'),
				}),
				/studio_credo_does_not_exist.*does not exist/
			);
		} finally {
			process.env.CREDO_DB_NAME = saved;
		}
	});
});
