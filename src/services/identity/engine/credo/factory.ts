import { createHash } from 'node:crypto';
import pkg from 'pg-connection-string';
import { PrivateKeyStore } from '@veramo/data-store';
import { SecretBox } from '@veramo/kms-local';
import { Connection } from '../../../../database/connection/connection.js';
import { withPayerLock } from '../../ledger-lock.js';
import { CredoEngine } from './credo-engine.js';
import { createCredoRuntime, type CredoRuntimeOptions } from './credo-runtime.js';
import { createPayerResolver } from './payer.js';
import type { CredoRuntime } from './ports.js';
import { TypeOrmCredoEngineStore } from './typeorm-store.js';

let engine: CredoEngine | undefined;

/** Askar's store key. Derived from the secret Studio already uses, unless `CREDO_STORE_KEY` is set. */
function storeKeyFromEnvironment(): string {
	if (process.env.CREDO_STORE_KEY) return process.env.CREDO_STORE_KEY;
	const secret = process.env.EXTERNAL_DB_ENCRYPTION_KEY;
	if (!secret) throw new Error('EXTERNAL_DB_ENCRYPTION_KEY (or CREDO_STORE_KEY) is required for the Credo engine');
	// Domain-separated, so the store key is not the SecretBox key itself
	return createHash('sha256').update(`credo-askar-store:${secret}`).digest('hex');
}

function databaseFromEnvironment(): CredoRuntimeOptions['database'] {
	const { parse } = pkg;
	const config = parse(process.env.EXTERNAL_DB_CONNECTION_URL ?? '');
	if (!(config.host && config.port && config.database)) throw new Error('Invalid EXTERNAL_DB_CONNECTION_URL');
	const caCertificate = process.env.EXTERNAL_DB_CERT;
	return {
		host: config.host,
		port: Number(config.port),
		name: config.database,
		// Askar keeps its tables in a schema named after the connecting user: set CREDO_DB_USER to `credo` to use
		// schema `credo`, otherwise the schema carries the name of Studio's own database user.
		user: process.env.CREDO_DB_USER || config.user || '',
		password: process.env.CREDO_DB_PASSWORD || config.password || '',
		sslMode: config.ssl ? (caCertificate ? 'verify-ca' : 'require') : 'disable',
		caCertificate,
	};
}

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
	if (engine) return engine;
	if (process.env.ENABLE_EXTERNAL_DB !== 'true') {
		throw new Error('The Credo engine needs the Postgres database: set ENABLE_EXTERNAL_DB=true');
	}

	const dataSource = Connection.instance.dbConnection;
	const privateKeyStore = new PrivateKeyStore(dataSource, new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY));
	const store = new TypeOrmCredoEngineStore(dataSource, privateKeyStore);

	const runtime = lazyRuntime(() =>
		createCredoRuntime({
			privateKeyStore,
			database: databaseFromEnvironment(),
			storeKey: storeKeyFromEnvironment(),
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

	engine = new CredoEngine({
		store,
		runtime,
		withPayerLock: (address, work) => withPayerLock(dataSource, address, work),
		resolverUrl: process.env.RESOLVER_URL,
	});
	return engine;
}
