// Runtime smoke test for Credo inside the Studio image.
// Proves that: (1) Askar and AnonCreds native binaries load on this libc,
// (2) an Askar-backed agent opens a Postgres store, (3) the cheqd module
// resolves a real testnet did:cheqd read-only.
//
// Run inside the built image:
//   docker run --rm --network <net> -e PG_HOST=<host> -v "$PWD/scripts/credo-runtime-smoke.mjs:/home/node/app/smoke.mjs:ro" <image> node smoke.mjs
import { AnonCredsModule } from '@credo-ts/anoncreds';
import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar';
import { CheqdDidResolver, CheqdModule } from '@credo-ts/cheqd';
import { CheqdAnonCredsRegistry } from '@credo-ts/cheqd/anoncreds';
import { Agent, DidsModule } from '@credo-ts/core';
import { agentDependencies } from '@credo-ts/node';
import { anoncreds } from '@hyperledger/anoncreds-nodejs';
import { NativeAskar } from '@openwallet-foundation/askar-nodejs';
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

const agent = new Agent({
	config: {},
	dependencies: agentDependencies,
	modules: {
		askar: new AskarModule({
			askar: NativeAskar,
			multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
			store: {
				id: env.PG_DB ?? 'credo_smoke',
				key: 'smoke-test-key-not-a-secret',
				keyDerivationMethod: 'kdf:argon2i:int',
				database: {
					type: 'postgres',
					config: {
						host: `${env.PG_HOST ?? 'localhost'}:${env.PG_PORT ?? '5432'}`,
						connectionParameters: { sslmode: 'disable' },
					},
					credentials: { account: 'postgres', password: env.PG_PASSWORD ?? 'postgres' },
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
