import { PrivateKeyStore } from '@veramo/data-store';
import { SecretBox } from '@veramo/kms-local';
import { Connection } from '../../../../database/connection/connection.js';
import { withPayerLock } from '../../ledger-lock.js';
import { CredoEngine } from './credo-engine.js';
import { loadCredoStorageConfig } from './config.js';
import { createCredoRuntime } from './credo-runtime.js';
import { CredoConfigurationError } from './errors.js';
import { createPayerResolver } from './payer.js';
import type { CredoRuntime } from './ports.js';
import { TypeOrmCredoEngineStore } from './typeorm-store.js';

let engine: CredoEngine | undefined;

/**
 * A runtime that starts Credo on first use, so merely registering the engine with the router costs nothing and a
 * failed start is retried on the next call instead of being cached.
 */
function lazyRuntime(start: () => Promise<CredoRuntime>): CredoRuntime {
	let started: Promise<CredoRuntime> | undefined;
	const get = () => {
		started ??= start().catch((error) => {
			started = undefined;
			throw error;
		});
		return started;
	};
	return {
		createTenant: async (label) => (await get()).createTenant(label),
		deleteTenant: async (id) => (await get()).deleteTenant(id),
		withTenant: async (id, work) => (await get()).withTenant(id, work),
		resolveDid: async (did, options) => (await get()).resolveDid(did, options),
		shutdown: async () => {
			if (started) await (await started).shutdown();
			started = undefined;
		},
	};
}

/** The process-wide `CredoEngine`, wired to Studio's database and key store. Needs the Postgres database. */
export function getCredoEngine(): CredoEngine {
	engine ??= createCredoEngine();
	return engine;
}

/** A new `CredoEngine` (the process uses `getCredoEngine`). Reads Credo's storage settings on its first call. */
export function createCredoEngine(): CredoEngine {
	if (process.env.ENABLE_EXTERNAL_DB !== 'true') {
		throw new CredoConfigurationError([
			'ENABLE_EXTERNAL_DB must be true (the Credo engine needs the Postgres database)',
		]);
	}

	const dataSource = Connection.instance.dbConnection;
	const privateKeyStore = new PrivateKeyStore(dataSource, new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY));
	const store = new TypeOrmCredoEngineStore(dataSource, privateKeyStore);

	// The storage settings are read when the runtime first starts, not here: Studio starts, and the router can build
	// this engine, without any Credo storage variable. A missing one fails the Credo call with a clear error.
	const runtime = lazyRuntime(() =>
		createCredoRuntime({
			privateKeyStore,
			storage: loadCredoStorageConfig(),
			networks: [
				{ network: 'mainnet', rpcUrl: process.env.MAINNET_RPC_URL || undefined },
				{ network: 'testnet', rpcUrl: process.env.TESTNET_RPC_URL || undefined },
			],
			resolvePayer: createPayerResolver(store),
			onKeyCreated: async (tenantId, kid, key) => {
				const customerId = await store.findCustomerIdByTenantId(tenantId);
				if (!customerId) throw new Error('No customer owns this Credo tenant');
				await store.insertOwnedKey(customerId, {
					kid,
					type: key.type,
					publicKeyHex: key.publicKeyHex,
					kms: 'postgres',
				});
			},
		})
	);

	return new CredoEngine({
		store,
		runtime,
		withPayerLock: (address, work) => withPayerLock(dataSource, address, work),
		resolverUrl: process.env.RESOLVER_URL,
	});
}
