import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from './helpers/credo-database.js';

/**
 * Agent key rotation through the real Credo engine and registrar, on a real Postgres and Askar store, with the cheqd
 * ledger replaced by an in-memory one. The fake ledger runs the same pre-broadcast check `@cheqd/sdk` runs on every
 * update (`DIDModule.validateAuthenticationAgainstSignaturesKeyRotation`), which is what refused every rotation on
 * staging ("signature from key …#key-2 is not required"), so the test fails without `StudioCheqdDidRegistrar`.
 *
 * Like the other Credo integration tests it uses Node's test runner and is not part of `npm run test:unit`:
 *
 *   docker run -d --rm --name credo-it-db -e POSTGRES_PASSWORD=postgres -p 54335:5432 postgres:16
 *   CREDO_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54335/postgres \
 *     npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/agent-key-rotation.test.ts
 */
const adminUrl = process.env.CREDO_TEST_DATABASE_URL;
const skip = adminUrl ? false : 'set CREDO_TEST_DATABASE_URL to run (see the comment at the top of this file)';

type LedgerEntry = { didDocument: Record<string, unknown>; versionId: string };
type SignInput = { verificationMethodId: string };

describe('agent key rotation through the Credo engine (ledger in memory)', { skip }, () => {
	let db: TestDatabase;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically by the helper
	let studio: any;
	const alice = { customerId: randomUUID() } as never;
	const ledger = new Map<string, LedgerEntry>();
	const updates: { signers: string[] }[] = [];

	before(async () => {
		db = await createTestDatabase(adminUrl as string);
		studio = db.studio;

		const { CheqdLedgerService } = await import('@credo-ts/cheqd');
		const { DIDModule } = await import('@cheqd/sdk');
		const fake = CheqdLedgerService.prototype as unknown as Record<string, unknown>;
		const store = (payload: { id: string }) =>
			ledger.set(payload.id, { didDocument: structuredClone(payload), versionId: randomUUID() });
		fake.connect = async () => undefined;
		fake.create = async (_context: unknown, payload: { id: string }) => {
			store(payload);
			return { code: 0 };
		};
		fake.update = async (_context: unknown, payload: { id: string }, signInputs: SignInput[]) => {
			const previous = ledger.get(payload.id);
			assert.ok(previous, 'the DID is on the fake ledger');
			const check = await DIDModule.validateAuthenticationAgainstSignaturesKeyRotation(
				structuredClone(payload) as never,
				signInputs as never,
				{} as never,
				structuredClone(previous.didDocument) as never
			);
			if (!check.valid) throw new Error(`DID authentication is not valid: ${check.error}`);
			updates.push({ signers: signInputs.map((input) => input.verificationMethodId) });
			store(payload);
			return { code: 0 };
		};
		fake.resolve = async (did: string) => {
			const entry = ledger.get(did);
			if (!entry) throw new Error(`${did} not found`);
			return {
				didDocument: structuredClone(entry.didDocument),
				didDocumentMetadata: { versionId: entry.versionId, deactivated: false },
			};
		};
		fake.resolveCollectionResources = async () => ({ resources: [] });

		// A testnet payment account for alice, so the engine has a fee payer (nothing is broadcast)
		await db.insertCustomer((alice as { customerId: string }).customerId, 'alice');
		const privateKeyHex = randomBytes(32).toString('hex');
		const ecdh = createECDH('secp256k1');
		ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'));
		const kid = ecdh.getPublicKey(undefined, 'compressed').toString('hex');
		const keys = new studio.PrivateKeyStore(
			studio.Connection.instance.dbConnection,
			new studio.SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY)
		);
		await keys.importKey({ alias: kid, type: 'Secp256k1', privateKeyHex });
		const key = new studio.KeyEntity(kid, 'Secp256k1', kid);
		key.kms = 'postgres';
		key.customer = alice;
		await studio.Connection.instance.dbConnection.getRepository(studio.KeyEntity).insert(key);
		await studio.PaymentAccountService.instance.create('testnet', true, alice, key);
	});

	after(async () => {
		await db?.teardown();
	});

	it('rotates key-1 and then key-2 of an agent DID, each signed by the added and the removed key only', async () => {
		const agentKeys = await import('../../src/services/agent/agent-keys.js');
		const agentEngine = await import('../../src/services/agent/agent-engine.js');
		const engine = studio.engine;

		const p256 = await engine.createKey('Secp256r1', alice, 'agent-it-p256');
		const ed25519 = await engine.createKey('Ed25519', alice, 'agent-it-ed25519');
		const created = agentKeys.buildAgentDidDocument({
			network: 'testnet',
			id: randomUUID(),
			p256PublicKeyHex: p256.publicKeyHex,
			ed25519PublicKeyHex: ed25519.publicKeyHex,
		});
		const did = created.id;
		await engine.createDid('testnet', created, alice);

		// What AgentService.rotateKey does, step for step
		const rotate = async (oldFragment: string, type: 'P-256' | 'Ed25519') => {
			const resolved = await agentEngine.resolveDidKeys(engine, did);
			const key = await engine.createKey(type === 'P-256' ? 'Secp256r1' : 'Ed25519', alice, `rotated-${type}`);
			const fragment = agentKeys.nextKeyFragment(resolved.document);
			const next = agentKeys.documentWithNewKey(
				resolved.document,
				{ fragment, type, publicKeyHex: key.publicKeyHex },
				`${did}#${oldFragment}`
			);
			await engine.updateDid(next, alice);
			return fragment;
		};

		assert.equal(await rotate('key-1', 'P-256'), 'key-3');
		assert.deepEqual(updates[0].signers.sort(), [`${did}#key-1`, `${did}#key-3`]);

		assert.equal(await rotate('key-2', 'Ed25519'), 'key-4');
		assert.deepEqual(updates[1].signers.sort(), [`${did}#key-2`, `${did}#key-4`]);

		const after = (await agentEngine.resolveDidKeys(engine, did)).document;
		assert.deepEqual(agentKeys.relationshipIds(after, 'authentication'), [`${did}#key-3`, `${did}#key-4`]);
		assert.equal((after.verificationMethod as unknown[]).length, 4, 'rotated keys stay so old credentials verify');
	});
});
