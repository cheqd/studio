import { PrivateKeyStore } from '@veramo/data-store';
import { SecretBox } from '@veramo/kms-local';
import { Connection } from '../../../../database/connection/connection.js';
import { withPayerLock } from '../../ledger-lock.js';
import { sharedPayerLockSource } from '../../payer-lock-pool.js';
import { CredoEngine } from './credo-engine.js';
import { loadCredoStorageConfig } from './config.js';
import { createCredoRuntime } from './credo-runtime.js';
import { CredoConfigurationError } from './errors.js';
import { createPayerResolver } from './payer.js';
import type { CredoRuntime } from './ports.js';
import { TypeOrmCredoEngineStore } from './typeorm-store.js';
import { TypeOrmStatusListOwnership } from './status-list-ownership.js';

let engine: CredoEngine | undefined;
let activeRuntime: LazyCredoRuntime | undefined;

/** Shuts down the process-wide Credo runtime if one was built (it starts lazily, so an unused one costs nothing). */
export async function shutdownCredoRuntime(): Promise<void> {
	const runtime = activeRuntime;
	activeRuntime = undefined;
	await runtime?.shutdown();
}

/**
 * Starts the process-wide Credo runtime now, rather than on the first Credo call, and resolves once its store is open.
 * The boot awaits this before the server listens (`enforceCredoRuntime`), so no request ever starts Credo.
 */
export async function startCredoRuntime(): Promise<void> {
	getCredoEngine();
	if (!activeRuntime) throw new Error('The Credo runtime was not created');
	await activeRuntime.ready();
}

export interface LazyCredoRuntime extends CredoRuntime {
	/** Starts the runtime if it has not started, and resolves once it has. Concurrent callers share one start. */
	ready(): Promise<void>;
}

/**
 * A runtime that starts Credo once, on `ready()` (the boot) or on first use, whichever comes first. Every caller
 * shares the one start in flight; a failed start is not cached, so the next call starts again.
 */
export function lazyRuntime(start: () => Promise<CredoRuntime>): LazyCredoRuntime {
	let started: Promise<CredoRuntime> | undefined;
	const get = () => {
		started ??= start().catch((error) => {
			started = undefined;
			throw error;
		});
		return started;
	};
	return {
		ready: async () => {
			await get();
		},
		createTenant: async (label) => (await get()).createTenant(label),
		deleteTenant: async (id) => (await get()).deleteTenant(id),
		withTenant: async (id, work) => (await get()).withTenant(id, work),
		resolveDid: async (did, options) => (await get()).resolveDid(did, options),
		readResource: async (didUrl) => (await get()).readResource?.(didUrl) ?? { error: 'notImplemented' },
		readTokenStatusList: async (did, name) => (await get()).readTokenStatusList?.(did, name) ?? null,
		didVersionCount: async (did) => {
			const runtime = await get();
			if (!runtime.didVersionCount) throw new Error('This Credo runtime cannot count DID versions');
			return runtime.didVersionCount(did);
		},
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

	activeRuntime = runtime;
	return new CredoEngine({
		store,
		runtime,
		withPayerLock: (address, work) => withPayerLock(sharedPayerLockSource(), address, work),
		resolverUrl: process.env.RESOLVER_URL,
		statusListOwnership: new TypeOrmStatusListOwnership(dataSource),
	});
}
