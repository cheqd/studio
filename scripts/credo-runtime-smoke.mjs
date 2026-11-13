// Runtime smoke test for Credo inside the Studio image.
// Proves that: (1) Askar and AnonCreds native binaries load on this libc,
// (2) an Askar-backed agent opens a Postgres store, (3) the cheqd module
// resolves a real testnet did:cheqd read-only.
//
// Run inside the built image:
//   docker run --rm --network <net> -e PG_HOST=<host> -e PG_PASSWORD=<app role password> \
//     -v "$PWD/scripts/credo-runtime-smoke.mjs:/home/node/app/smoke.mjs:ro" <image> node smoke.mjs
//
// The database (PG_DB, default studio_credo) and the app role (PG_USER, default studio_credo_app) must already
// exist: create them with scripts/credo-database-provisioning.sql (docs/credo-database-provisioning.md). The smoke
// test connects as the app role only, never as an admin, and uses a fake raw store key (override with
// CREDO_STORE_KEY_HEX, 64 hex characters). It provisions the Askar store on first run, as Studio's runtime does.
import { AnonCredsModule } from '@credo-ts/anoncreds';
import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar';
import { CheqdDidResolver, CheqdModule } from '@credo-ts/cheqd';
import { CheqdAnonCredsRegistry } from '@credo-ts/cheqd/anoncreds';
import { Agent, DidsModule, JsonTransformer, StorageVersionRecord } from '@credo-ts/core';
import { agentDependencies } from '@credo-ts/node';
import { anoncreds } from '@hyperledger/anoncreds-nodejs';
import { KdfMethod, NativeAskar, Store, StoreKeyMethod } from '@openwallet-foundation/askar-nodejs';
import { readFileSync } from 'node:fs';

const env = process.env;
const did = env.TEST_DID ?? 'did:cheqd:testnet:b06256ce-8820-4c8b-b2b2-d8e8d0526080';
const libc = (() => {
	try {
		return readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)/m)?.[1];
	} catch {
		return 'unknown';
	}
})();
console.log(`os=${libc} arch=${process.arch} node=${process.version}`);
NativeAskar.instance.version();
anoncreds.version();
console.log('askar and anoncreds native libraries loaded');

const database = env.PG_DB ?? 'studio_credo';
const user = env.PG_USER ?? 'studio_credo_app';
const password = env.PG_PASSWORD ?? 'studio_credo_app';
const host = `${env.PG_HOST ?? 'localhost'}:${env.PG_PORT ?? '5432'}`;
// A fake 32-byte key, in Askar's raw form (base58). Not a secret.
const rawKey = (() => {
	const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
	let n = BigInt(`0x${env.CREDO_STORE_KEY_HEX ?? '11'.repeat(32)}`);
	let out = '';
	while (n > 0n) {
		out = alphabet[Number(n % 58n)] + out;
		n /= 58n;
	}
	return out;
})();

// Askar does not provision a store in a database that exists but has no Askar schema, so do it as Studio does
const uri = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=disable`;
const keyMethod = () => new StoreKeyMethod(KdfMethod.Raw);
try {
	await (await Store.open({ uri, keyMethod: keyMethod(), passKey: rawKey })).close();
} catch (error) {
	if (!/does not exist|not found/i.test(error.message)) throw error;
	const store = await Store.provision({
		uri,
		keyMethod: keyMethod(),
		passKey: rawKey,
		profile: database,
		recreate: false,
	});
	const session = await store.session(database).open();
	const record = new StorageVersionRecord({ storageVersion: StorageVersionRecord.frameworkStorageVersion });
	await session.insert({
		category: StorageVersionRecord.type,
		name: record.id,
		value: JsonTransformer.serialize(record),
		tags: {},
	});
	await session.close();
	await store.close();
	console.log('askar store provisioned');
}

const agent = new Agent({
	config: {},
	dependencies: agentDependencies,
	modules: {
		askar: new AskarModule({
			askar: NativeAskar,
			enableKms: false,
			multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
			store: {
				id: database,
				key: rawKey,
				keyDerivationMethod: 'raw',
				database: {
					type: 'postgres',
					config: {
						host,
						maxConnections: 5,
						idleTimeout: 30,
						connectTimeout: 10,
						connectionParameters: { sslmode: 'disable' },
					},
					credentials: { account: user, password },
				},
			},
		}),
		anoncreds: new AnonCredsModule({ anoncreds, registries: [new CheqdAnonCredsRegistry()] }),
		cheqd: new CheqdModule({
			networks: [{ network: 'testnet', rpcUrl: env.TESTNET_RPC_URL ?? 'https://rpc.cheqd.network:443' }],
		}),
		dids: new DidsModule({ registrars: [], resolvers: [new CheqdDidResolver()] }),
	},
});

await agent.initialize();
console.log('askar+postgres agent initialised, wallet open');

const res = await agent.dids.resolve(did);
if (!res.didDocument || res.didDocument.id !== did) {
	console.error('RESOLVE FAILED', JSON.stringify(res.didResolutionMetadata));
	process.exit(1);
}
console.log(`resolved ${res.didDocument.id}; verificationMethods=${res.didDocument.verificationMethod?.length}`);
await agent.shutdown();
console.log('SMOKE OK');
process.exit(0);
