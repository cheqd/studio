import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar';
import { CheqdDidRegistrar, CheqdDidResolver, CheqdModule } from '@credo-ts/cheqd';
import {
	Agent,
	type AgentContext,
	DidDocument,
	DidRepository,
	DidsModule,
	JsonTransformer,
	Kms,
	StorageVersionRecord,
} from '@credo-ts/core';
import { agentDependencies, NodeKeyManagementService } from '@credo-ts/node';
import { TenantsModule } from '@credo-ts/tenants';
import { KdfMethod, NativeAskar, Store, StoreKeyMethod } from '@openwallet-foundation/askar-nodejs';
import type { PrivateKeyStore } from '@veramo/data-store';
import { VeramoKeyManagementStorage } from '../../credo/VeramoKeyManagementStorage.js';
import type { EngineDidDocument, EngineDidResolution } from '../types.js';
import { publicKeyHexFromJwk, veramoTypeFromJwk } from './key-material.js';
import { createStatusListSession } from './status-lists-session.js';
import type { CredoRuntime, CredoTenantSession, DidOperationResult } from './ports.js';
import type { CredoStorageConfig } from './config.js';
import { CredoConfigurationError } from './errors.js';
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
const STORE_KEY_METHOD = () => new StoreKeyMethod(KdfMethod.Raw);

function storeUri(options: CredoStorageConfig['database'], caPath?: string) {
	const enc = encodeURIComponent;
	const params = [`sslmode=${options.sslMode}`];
	if (caPath) params.push(`sslrootcert=${enc(caPath)}`);
	return `postgres://${enc(options.user)}:${enc(options.password)}@${options.host}:${options.port}/${enc(options.name)}?${params.join('&')}`;
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
async function provisionStoreIfMissing(options: CredoRuntimeOptions, caPath?: string) {
	const uri = storeUri(options.storage.database, caPath);
	const databaseName = options.storage.database.name;
	try {
		const store = await Store.open({ uri, keyMethod: STORE_KEY_METHOD(), passKey: options.storage.storeKey });
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
		keyMethod: STORE_KEY_METHOD(),
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
		async deactivateDid(did) {
			const result = await tenantAgent.dids.deactivate({ did });
			return toResult(result.didState);
		},
		async createResource(did, resource) {
			const result = await tenantAgent.modules.cheqd.createResource(did, resource);
			return { state: result.resourceState.state, reason: result.resourceState.reason };
		},
		async importKey(privateJwk, keyId) {
			await tenantAgent.kms.importKey({ privateJwk: { ...privateJwk, kid: keyId } });
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
	let caPath: string | undefined;
	if (options.storage.database.caCertificate) {
		caPath = join(mkdtempSync(join(tmpdir(), 'credo-ca-')), 'ca.pem');
		writeFileSync(caPath, options.storage.database.caCertificate, { mode: 0o600 });
	}
	await provisionStoreIfMissing(options, caPath);

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
			askar: new AskarModule({
				askar: NativeAskar,
				enableKms: false,
				multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
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
							connectionParameters: {
								sslmode: options.storage.database.sslMode,
								...(caPath ? { sslrootcert: caPath } : {}),
							},
						},
						credentials: {
							account: options.storage.database.user,
							password: options.storage.database.password,
						},
					},
				},
			}),
			kms: new Kms.KeyManagementModule({ backends: [new NodeKeyManagementService(keyStorage)] }),
			tenants: new TenantsModule({ sessionLimit: options.sessionLimit ?? 100, sessionAcquireTimeout: 10_000 }),
			cheqd: new CheqdModule({
				networks: options.networks,
				resolvePayer: async ({ tenantId, network }) => options.resolvePayer({ tenantId, network }),
			}),
			dids: new DidsModule({ registrars: [new CheqdDidRegistrar()], resolvers: [new CheqdDidResolver()] }),
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
		async shutdown() {
			await agent.shutdown();
		},
	};
}
