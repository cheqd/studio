import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheqdDidResolver, CheqdLedgerService, CheqdModule } from '@credo-ts/cheqd';
import { StudioCheqdDidRegistrar } from './studio-did-registrar.js';
import {
	Agent,
	type AgentContext,
	CacheModule,
	DidDocument,
	DidRepository,
	DidsModule,
	InMemoryLruCache,
	JsonLdModule,
	JsonTransformer,
	Kms,
	StorageVersionRecord,
} from '@credo-ts/core';
import { agentDependencies, NodeKeyManagementService } from '@credo-ts/node';
import { TenantsModule } from '@credo-ts/tenants';
import type { PrivateKeyStore } from '@veramo/data-store';
import { VeramoKeyManagementStorage } from '../../credo/VeramoKeyManagementStorage.js';
import type { EngineDidDocument, EngineDidResolution } from '../types.js';
import { credentialSession } from './credential-session.js';
import { createSafeDocumentLoader } from './safe-document-loader.js';
import { publicKeyHexFromJwk, veramoTypeFromJwk } from './key-material.js';
import { createStatusListSession } from './status-lists-session.js';
import { type AskarBindings, loadAskar } from './askar-native.js';
import type { CredoRuntime, CredoTenantSession, DidOperationResult } from './ports.js';
import type { CredoStorageConfig } from './config.js';
import { CredoConfigurationError, CredoKeyExistsError } from './errors.js';
import type { PayerRequest, ResolvedPayer } from './payer.js';

export interface CredoRuntimeOptions {
	privateKeyStore: PrivateKeyStore;
	/** Called when Credo creates a key inside a tenant, so Studio can record it as that customer's key */
	onKeyCreated: (tenantId: string, kid: string, key: { type: string; publicKeyHex: string }) => Promise<void>;
	resolvePayer: (request: PayerRequest) => Promise<ResolvedPayer>;
	/** Credo's own database, app role, pool settings and raw store key (see `loadCredoStorageConfig`) */
	storage: CredoStorageConfig;
	networks: { network: 'mainnet' | 'testnet'; rpcUrl?: string }[];
	sessionLimit?: number;
}

/** The store key is a raw 32-byte key (never a passphrase), so there is no derivation step */
const storeKeyMethod = ({ StoreKeyMethod, KdfMethod }: AskarBindings) => new StoreKeyMethod(KdfMethod.Raw);

/**
 * Query parameters the native Askar library reads itself and removes from a Postgres URI. Every other parameter is
 * passed on to the driver (sqlx) in a query string that Askar rebuilds from a hash map, in a random order and without
 * `&` between the pairs (askar 0.5.0, as loaded by askar-nodejs 0.6.1). One such parameter is passed on intact; two
 * are glued together. With `sslmode=verify-ca&sslrootcert=<ca>` the driver sees either
 * `sslmode=verify-casslrootcert=<ca>` (refused: "unknown value ... for `ssl_mode`") or
 * `sslrootcert=<ca>sslmode=verify-ca` (accepted, but neither setting is applied as given).
 * The order differs on each open, which is why only some Credo calls failed after a deploy (U-68).
 */
export const ASKAR_CONSUMED_POSTGRES_PARAMETERS: readonly string[] = [
	'connect_timeout',
	'idle_timeout',
	'max_connections',
	'min_connections',
	'admin_account',
	'admin_password',
];

/**
 * How Credo's store connects, in a form Askar passes on intact: `sslmode` is the only query parameter Askar does not
 * consume, and the CA file is given to the driver through `PGSSLROOTCERT`, which sqlx reads when it parses the
 * options (node-postgres, used for Studio's own database, does not read it).
 */
export function credoPostgresConnection(database: CredoStorageConfig['database'], caPath?: string) {
	const enc = encodeURIComponent;
	const connectionParameters: Record<string, string> = { sslmode: database.sslMode };
	const environment: Record<string, string> = caPath ? { PGSSLROOTCERT: caPath } : {};
	return {
		/** For opening the store directly (the provisioning check) */
		uri: `postgres://${enc(database.user)}:${enc(database.password)}@${database.host}:${database.port}/${enc(database.name)}?sslmode=${enc(database.sslMode)}`,
		/** For Credo's Askar module, which builds its own URI from these */
		connectionParameters,
		/** Set in `process.env` before the store is opened */
		environment,
	};
}

/**
 * Refuses a Postgres URI that would reach the driver with more than one parameter Askar does not consume (see
 * `ASKAR_CONSUMED_POSTGRES_PARAMETERS`): such a URI connects or fails at random.
 */
export function assertAskarSafePostgresUri(uri: string): void {
	const query = uri.includes('?') ? uri.slice(uri.indexOf('?') + 1) : '';
	const passedOn = Array.from(new URLSearchParams(query).keys()).filter(
		(key) => !ASKAR_CONSUMED_POSTGRES_PARAMETERS.includes(key)
	);
	if (passedOn.length > 1) {
		throw new CredoConfigurationError([
			`the Credo store URI passes ${passedOn.join(', ')} to the Postgres driver: Askar joins more than one such parameter without a separator`,
		]);
	}
}

/**
 * Opens Credo's store with the app role only (no admin credentials), and provisions it on the first run.
 *
 * Askar names its Postgres schema after the connecting user, and when the database exists but holds no Askar
 * schema it does not provision one itself. So when the open reports a missing store, this provisions it and writes
 * the framework storage version record that Credo's own provisioning would have written, so that
 * `agent.initialize()` accepts it. The database and the role are created once, by hand, from
 * `scripts/credo-database-provisioning.sql`: a missing database is reported as such and never created from here.
 */
async function provisionStoreIfMissing(askar: AskarBindings, options: CredoRuntimeOptions, caPath?: string) {
	const { Store } = askar;
	const { uri } = credoPostgresConnection(options.storage.database, caPath);
	assertAskarSafePostgresUri(uri);
	const databaseName = options.storage.database.name;
	try {
		const store = await Store.open({ uri, keyMethod: storeKeyMethod(askar), passKey: options.storage.storeKey });
		await store.close();
		return;
	} catch (error) {
		const message = (error as Error).message ?? '';
		// A wrong store key, bad credentials or a connection problem: provisioning would not fix it, so fail
		// closed. Only a database with no Askar schema yet is provisioned.
		if (!/does not exist|not found/i.test(message)) throw error;
	}

	const profile = options.storage.database.name;
	const store = await Store.provision({
		uri,
		keyMethod: storeKeyMethod(askar),
		passKey: options.storage.storeKey,
		profile,
		recreate: false,
	}).catch((error: Error) => {
		// With a missing database Askar tries to create it, which the app role may not do (and must not)
		if (/permission denied to create database|database .* does not exist/i.test(error.message ?? '')) {
			throw new CredoConfigurationError([
				`the Credo database "${databaseName}" does not exist on the cluster (CREDO_DB_NAME): run scripts/credo-database-provisioning.sql as the admin user`,
			]);
		}
		throw error;
	});
	try {
		const session = await store.session(profile).open();
		const record = new StorageVersionRecord({ storageVersion: StorageVersionRecord.frameworkStorageVersion });
		await session.insert({
			category: StorageVersionRecord.type,
			name: record.id,
			value: JsonTransformer.serialize(record),
			tags: {},
		});
		await session.close();
	} finally {
		await store.close();
	}
}

const tenantIdOf = (agentContext: AgentContext) => {
	const id = agentContext.contextCorrelationId;
	return id.startsWith('tenant-') ? id.slice('tenant-'.length) : undefined;
};

/** Narrow view of the pieces of a Credo tenant agent the session uses. */
interface TenantAgentLike {
	context: AgentContext;
	dependencyManager: { resolve<T>(token: unknown): T };
	// biome-ignore lint/suspicious/noExplicitAny: the Credo API objects are generic over the module set
	dids: any;
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	kms: any;
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	modules: any;
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	tokenStatusList: any;
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	w3cCredentials: any;
}

function toResult(state: { state: string; reason?: string; didDocument?: DidDocument }): DidOperationResult {
	return {
		state: state.state,
		reason: state.reason,
		didDocument: state.didDocument?.toJSON() as EngineDidDocument | undefined,
	};
}

function session(tenantAgent: TenantAgentLike): CredoTenantSession {
	const toCredoDocument = (doc: EngineDidDocument) => JsonTransformer.fromJSON(doc, DidDocument);
	const record = async (did: string) =>
		tenantAgent.dependencyManager.resolve<DidRepository>(DidRepository).findCreatedDid(tenantAgent.context, did);

	return {
		...credentialSession(tenantAgent),
		async createDid({ didDocument, network, keys }) {
			const result = await tenantAgent.dids.create({
				method: 'cheqd',
				didDocument: toCredoDocument(didDocument),
				options: { network, keys },
			});
			return toResult(result.didState);
		},
		async updateDid({ did, didDocument, keys }) {
			const result = await tenantAgent.dids.update({
				did,
				didDocument: toCredoDocument(didDocument),
				options: { keys },
			});
			return toResult(result.didState);
		},
		async deactivateDid(did, deactivateOptions) {
			// The registrar passes `feeOptions` to the ledger service, which builds the fee from it (patches/@credo-ts+cheqd)
			const gasLimit = deactivateOptions?.gasLimit;
			const result = await tenantAgent.dids.deactivate({
				did,
				...(gasLimit ? { options: { feeOptions: { gasLimit } } } : {}),
			});
			return toResult(result.didState);
		},
		async createResource(did, resource) {
			const result = await tenantAgent.modules.cheqd.createResource(did, resource);
			return { state: result.resourceState.state, reason: result.resourceState.reason };
		},
		async importDid({ did, didDocument, keys }) {
			await tenantAgent.dids.import({ did, didDocument: toCredoDocument(didDocument), keys, overwrite: true });
		},
		async importKey(privateJwk, keyId) {
			try {
				await tenantAgent.kms.importKey({ privateJwk: { ...privateJwk, kid: keyId } });
			} catch (error) {
				if (error instanceof Kms.KeyManagementKeyExistsError) throw new CredoKeyExistsError(keyId);
				throw error;
			}
		},
		async deleteKey(keyId) {
			await tenantAgent.kms.deleteKey({ keyId });
		},
		async recordedKeyIds(did) {
			const found = await record(did);
			return found ? (found.keys ?? []).map((key) => key.kmsKeyId) : null;
		},
		async recordedServices(did) {
			const found = await record(did);
			return (found?.didDocument?.toJSON().service as Record<string, unknown>[] | undefined) ?? [];
		},
		statusLists: createStatusListSession(tenantAgent as never),
	};
}

/**
 * The real Credo runtime: one agent with the Askar (Postgres), tenants, KMS and cheqd modules. Signing keys are in
 * Studio's key store through `VeramoKeyManagementStorage` (#877), not in Askar. The cheqd module gets the
 * per-customer fee payer from `resolvePayer`.
 */
export async function createCredoRuntime(options: CredoRuntimeOptions): Promise<CredoRuntime> {
	const askar = await loadAskar();
	let caPath: string | undefined;
	if (options.storage.database.caCertificate) {
		caPath = join(mkdtempSync(join(tmpdir(), 'credo-ca-')), 'ca.pem');
		writeFileSync(caPath, options.storage.database.caCertificate, { mode: 0o600 });
	}
	const connection = credoPostgresConnection(options.storage.database, caPath);
	// Before any open: the driver reads the CA path from the environment (see `credoPostgresConnection`)
	Object.assign(process.env, connection.environment);
	await provisionStoreIfMissing(askar, options, caPath);

	const keyStorage = new VeramoKeyManagementStorage({
		privateKeyStore: options.privateKeyStore,
		onKeyCreated: async (agentContext, keyId, jwk) => {
			const tenantId = tenantIdOf(agentContext);
			// Keys made in the root context belong to no customer; the engine only creates keys in a tenant
			if (!tenantId) return;
			await options.onKeyCreated(tenantId, keyId, {
				type: veramoTypeFromJwk(jwk as { kty?: string; crv?: string }),
				publicKeyHex: publicKeyHexFromJwk(jwk as { kty?: string; crv?: string; x?: string; y?: string }),
			});
		},
	});

	const agent = new Agent({
		config: {},
		dependencies: agentDependencies,
		modules: {
			askar: new askar.AskarModule({
				askar: askar.NativeAskar,
				enableKms: false,
				multiWalletDatabaseScheme: askar.AskarMultiWalletDatabaseScheme.ProfilePerWallet,
				store: {
					id: options.storage.database.name,
					key: options.storage.storeKey,
					keyDerivationMethod: 'raw',
					database: {
						type: 'postgres',
						config: {
							host: `${options.storage.database.host}:${options.storage.database.port}`,
							maxConnections: options.storage.pool.maxConnections,
							idleTimeout: options.storage.pool.idleTimeout,
							connectTimeout: options.storage.pool.connectTimeout,
							connectionParameters: connection.connectionParameters,
						},
						credentials: {
							account: options.storage.database.user,
							password: options.storage.database.password,
						},
					},
				},
			}),
			// Credo's default cache refuses a second agent context, and every tenant is one: resolving a DID inside a
			// tenant (verifying a credential) fails with "SingleContextStorageLruCache can not be used with multiple
			// agent context instances". An in-memory cache is shared by all tenants; what it holds is public ledger data.
			cache: new CacheModule({ cache: new InMemoryLruCache({ limit: 500 }) }),
			// Remote JSON-LD contexts are fetched through safeFetch, never through the agent's own fetch
			jsonLd: new JsonLdModule({ documentLoader: createSafeDocumentLoader() }),
			kms: new Kms.KeyManagementModule({ backends: [new NodeKeyManagementService(keyStorage)] }),
			tenants: new TenantsModule({ sessionLimit: options.sessionLimit ?? 100, sessionAcquireTimeout: 10_000 }),
			cheqd: new CheqdModule({
				networks: options.networks,
				resolvePayer: async ({ tenantId, network }) => options.resolvePayer({ tenantId, network }),
			}),
			// Credo's registrar, signing key replacements with the keys the ledger SDK accepts (agent key rotation)
			dids: new DidsModule({
				registrars: [new StudioCheqdDidRegistrar()],
				resolvers: [new CheqdDidResolver()],
			}),
		},
	});
	await agent.initialize();

	// biome-ignore lint/suspicious/noExplicitAny: the module set is built above, the typed view adds nothing here
	const tenants = (agent as any).modules.tenants;

	return {
		async createTenant(label) {
			const tenant = await tenants.createTenant({ config: { label } });
			return tenant.id as string;
		},
		async deleteTenant(tenantId) {
			await tenants.deleteTenantById(tenantId);
		},
		withTenant(tenantId, work) {
			return tenants.withTenantAgent({ tenantId }, (tenantAgent: TenantAgentLike) => work(session(tenantAgent)));
		},
		async resolveDid(did, resolveOptions): Promise<EngineDidResolution> {
			const url =
				resolveOptions?.resourceMetadata !== undefined
					? `${did}?resourceMetadata=${resolveOptions.resourceMetadata}`
					: did;
			const result = await agent.dids.resolve(url);
			return {
				didDocument: (result.didDocument?.toJSON() as EngineDidDocument | undefined) ?? null,
				didDocumentMetadata: (result.didDocumentMetadata ?? {}) as EngineDidResolution['didDocumentMetadata'],
				didResolutionMetadata: (result.didResolutionMetadata ??
					{}) as EngineDidResolution['didResolutionMetadata'],
			};
		},
		async readResource(didUrl) {
			// biome-ignore lint/suspicious/noExplicitAny: the cheqd API is typed on the module set built above
			const result = await (agent as any).modules.cheqd.resolveResource(didUrl);
			if (result.error) return { error: result.error, message: result.message };
			return { resource: result.resource, resourceMetadata: result.resourceMetadata };
		},
		async readTokenStatusList(did, name) {
			// biome-ignore lint/suspicious/noExplicitAny: ditto
			return (agent as any).modules.cheqd.fetchTokenStatusList(did, name).catch(() => null);
		},
		async didVersionCount(did) {
			// Straight from the ledger: Credo's resolver drops the `/versions` path before it reaches the cheqd resolver
			const ledger = agent.dependencyManager.resolve(CheqdLedgerService);
			const { didDocumentVersionsMetadata } = await ledger.resolveMetadata(did);
			return didDocumentVersionsMetadata.length;
		},
		async shutdown() {
			await agent.shutdown();
		},
	};
}
