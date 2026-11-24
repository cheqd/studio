import { randomUUID } from 'node:crypto';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';
import type {
	CredoEngineStore,
	CredoRuntime,
	CredoTenantSession,
	DidKeyLink,
	DidOperationResult,
	IdentifierRecord,
	PayerAccount,
	ResourceInput,
	StoredKey,
} from '../../../../src/services/identity/engine/credo/ports.js';
import type { PrivateJwk } from '../../../../src/services/identity/engine/credo/key-material.js';
import { CredoKeyExistsError } from '../../../../src/services/identity/engine/credo/errors.js';
import { jwkToVeramoKey } from '../../../../src/services/identity/credo/keyConversion.js';
import { CredentialFakeState, credentialFakeSession } from './credential-fakes.js';
import type { EngineDidResolution, EngineIdentifier } from '../../../../src/services/identity/engine/types.js';

export const customer = (customerId: string) => ({ customerId }) as unknown as CustomerEntity;

/** In-memory Studio tables. Every customer-scoped lookup filters on the customer, like the real store must. */
export class FakeStore implements CredoEngineStore {
	tenants = new Map<string, string>();
	keys: (StoredKey & { customerId: string })[] = [];
	identifiers: (IdentifierRecord & { customerId: string })[] = [];
	payers = new Map<string, PayerAccount>(); // `${customerId}|${network}`
	privateKeys = new Map<string, string>();
	/** Studio's `private-key` table: kid to Veramo type and private key hex. Written by `FakeRuntime` imports. */
	keyMaterial = new Map<string, { type: string; privateKeyHex: string }>();
	failTenantWrite = false;
	private locks = new Map<string, Promise<unknown>>();

	async readTenantId(customerId: string) {
		return this.tenants.get(customerId) ?? null;
	}
	async writeTenantId(customerId: string, tenantId: string) {
		if (this.failTenantWrite) throw new Error('write failed');
		if (this.tenants.has(customerId)) throw new Error('already has a tenant');
		this.tenants.set(customerId, tenantId);
	}
	async withTenantCreationLock<T>(customerId: string, work: () => Promise<T>): Promise<T> {
		const previous = this.locks.get(customerId) ?? Promise.resolve();
		const run = previous.catch(() => undefined).then(work);
		this.locks.set(
			customerId,
			run.catch(() => undefined)
		);
		return run;
	}
	async findCustomerIdByTenantId(tenantId: string) {
		const found = [...this.tenants].filter(([, t]) => t === tenantId);
		return found.length === 1 ? found[0][0] : null;
	}

	async findOwnedKey(customerId: string, by: { kid: string } | { publicKeyHex: string }) {
		const match = this.keys.filter(
			(k) => k.customerId === customerId && ('kid' in by ? k.kid === by.kid : k.publicKeyHex === by.publicKeyHex)
		);
		return match.length > 0 ? match[0] : null;
	}
	async insertOwnedKey(customerId: string, key: StoredKey) {
		const existing = this.keys.find((k) => k.kid === key.kid);
		if (existing) {
			if (existing.customerId !== customerId) throw new Error(`Key ${key.kid} not found in wallet`);
			return;
		}
		this.keys.push({ ...key, customerId });
	}
	async finaliseOwnedKey(customerId: string, kid: string, alias?: string) {
		const key = this.keys.find((k) => k.kid === kid && k.customerId === customerId);
		if (!key) return null;
		if (alias) key.publicKeyAlias = alias;
		return key;
	}

	async readOwnedPrivateKey(customerId: string, kid: string) {
		if (!(await this.findOwnedKey(customerId, { kid }))) return null;
		const stored = this.keyMaterial.get(kid);
		return stored ? { alias: kid, privateKeyHex: stored.privateKeyHex } : null;
	}

	async deleteUnlinkedOwnedKey(customerId: string, kid: string) {
		const linked = this.identifiers.some((i) => i.customerId === customerId && i.keyIds.includes(kid));
		const index = this.keys.findIndex((k) => k.kid === kid && k.customerId === customerId);
		if (linked || index < 0) return false;
		this.keys.splice(index, 1);
		return true;
	}

	async isDidOwned(customerId: string, did: string) {
		return this.identifiers.filter((i) => i.did === did && i.customerId === customerId).length > 0;
	}
	async getIdentifier(customerId: string, did: string): Promise<EngineIdentifier | null> {
		const record = this.identifiers.find((i) => i.did === did && i.customerId === customerId);
		if (!record) return null;
		return {
			did: record.did,
			provider: record.provider,
			controllerKeyId: record.controllerKeyId,
			keys: record.keyIds.map((kid) => this.keys.find((k) => k.kid === kid) as StoredKey),
			services: record.services as never,
		};
	}
	async saveIdentifier(customerId: string, record: IdentifierRecord) {
		const existing = this.identifiers.find((i) => i.did === record.did);
		if (existing && existing.customerId !== customerId) throw new Error(`${record.did} not found in wallet`);
		if (existing)
			Object.assign(existing, { ...record, controllerKeyId: record.controllerKeyId ?? existing.controllerKeyId });
		else this.identifiers.push({ ...record, customerId });
		return (await this.getIdentifier(customerId, record.did)) as EngineIdentifier;
	}
	async listIdentifiers(customerId: string) {
		const own = this.identifiers.filter((i) => i.customerId === customerId);
		return { total: own.length, dids: own.map((i) => i.did) };
	}
	async listResources() {
		return { total: 0, resources: [] };
	}
	resources: { customerId: string; did: string; resourceId: string; resourceType: string }[] = [];
	async findLatestResourcesVersionsByType(customerId: string, resourceType: string, network?: string, did?: string) {
		const own = this.resources.filter(
			(r) =>
				r.customerId === customerId &&
				r.resourceType === resourceType &&
				(!did || r.did === did) &&
				(!network || r.did.startsWith(`did:cheqd:${network}:`))
		);
		return {
			total: own.length,
			resources: own.map((r) => ({
				resourceId: r.resourceId,
				resourceName: 'name',
				resourceType: r.resourceType,
				mediaType: 'application/json',
				previousVersionId: '',
				nextVersionId: '',
				did: r.did,
				encrypted: false,
			})),
		};
	}
	async listCredentialResources(customerId: string, options: { issuerId?: string; resourceTypes: string[] }) {
		const own = this.resources.filter(
			(r) =>
				r.customerId === customerId &&
				options.resourceTypes.includes(r.resourceType) &&
				(!options.issuerId || r.did === options.issuerId)
		);
		return { total: own.length, resources: own.map(({ did, resourceId }) => ({ did, resourceId })) };
	}
	async findOwnedResource(customerId: string, resourceId: string) {
		const found = this.resources.filter((r) => r.customerId === customerId && r.resourceId === resourceId);
		return found.length === 1 ? { did: found[0].did, resourceId } : null;
	}

	async findPayerAccount(customerId: string, network: string) {
		return this.payers.get(`${customerId}|${network}`) ?? null;
	}
	async readPayerPrivateKeyHex(kid: string) {
		return this.privateKeys.get(kid) ?? null;
	}

	addPayer(customerId: string, network: string, address = `cheqd1${customerId}${network}`) {
		this.payers.set(`${customerId}|${network}`, { address, kid: `payer-key-${customerId}-${network}` });
		this.privateKeys.set(`payer-key-${customerId}-${network}`, `${customerId}-secret`);
		return address;
	}
}

export interface RecordedCall {
	tenantId: string;
	method: string;
	args: unknown[];
}

/** A Credo runtime that records what the engine asks of each tenant and answers from a script. */
export class FakeRuntime implements CredoRuntime {
	tenants: string[] = [];
	deleted: string[] = [];
	calls: RecordedCall[] = [];
	events: string[] = [];
	deletedKeys: { tenantId: string; keyId: string }[] = [];
	imported: { tenantId: string; keyId: string; privateJwk: PrivateJwk }[] = [];
	/** KMS key ids each tenant's record of a DID signs with. `undefined` entry: the tenant never created the DID. */
	recorded = new Map<string, string[]>(); // `${tenantId}|${did}`
	createState: DidOperationResult = { state: 'finished' };
	updateState: DidOperationResult = { state: 'finished' };
	deactivateState: DidOperationResult = { state: 'finished' };
	resourceState: { state: string; reason?: string } = { state: 'finished' };
	resolution: EngineDidResolution = { didDocument: null, didDocumentMetadata: {}, didResolutionMetadata: {} };
	credentialState = new CredentialFakeState();

	/** With a key store, imports write to it and refuse a key id it already holds, like the real KMS. */
	constructor(private readonly keyStore?: Map<string, { type: string; privateKeyHex: string }>) {}

	async createTenant(label: string) {
		const id = `tenant-${randomUUID().slice(0, 8)}`;
		this.tenants.push(id);
		this.events.push(`createTenant:${label}`);
		return id;
	}
	async deleteTenant(tenantId: string) {
		this.deleted.push(tenantId);
	}
	async resolveDid(did: string) {
		return this.credentialState.resolutions.get(did) ?? this.resolution;
	}
	/** Versions the ledger holds for each DID; a DID with no entry makes `didVersionCount` fail. */
	versionCounts = new Map<string, number>();
	async didVersionCount(did: string) {
		const count = this.versionCounts.get(did);
		if (count === undefined) throw new Error(`no version metadata for ${did}`);
		return count;
	}
	async shutdown() {}

	async withTenant<T>(tenantId: string, work: (session: CredoTenantSession) => Promise<T>) {
		const record = (method: string, args: unknown[]) => {
			this.calls.push({ tenantId, method, args });
			this.events.push(`${method}`);
		};
		const session: CredoTenantSession = {
			createDid: async (input) => {
				record('createDid', [input]);
				for (const link of input.keys) this.noteKey(tenantId, input.didDocument.id, link);
				return this.createState;
			},
			updateDid: async (input) => {
				record('updateDid', [input]);
				return this.updateState;
			},
			deactivateDid: async (did, options) => {
				record('deactivateDid', [did, options]);
				return this.deactivateState;
			},
			createResource: async (did, resource: ResourceInput) => {
				record('createResource', [did, resource]);
				return this.resourceState;
			},
			importDid: async (input) => {
				record('importDid', [input]);
				this.recorded.set(
					`${tenantId}|${input.did}`,
					input.keys.map((link) => link.kmsKeyId)
				);
			},
			importKey: async (privateJwk, keyId) => {
				record('importKey', [keyId]);
				if (this.keyStore) {
					if (this.keyStore.has(keyId)) throw new CredoKeyExistsError(keyId);
					this.keyStore.set(keyId, jwkToVeramoKey(privateJwk as never));
				}
				this.imported.push({ tenantId, keyId, privateJwk });
			},
			deleteKey: async (keyId) => {
				record('deleteKey', [keyId]);
				this.deletedKeys.push({ tenantId, keyId });
			},
			recordedKeyIds: async (did) => this.recorded.get(`${tenantId}|${did}`) ?? null,
			recordedServices: async () => [],
			...credentialFakeSession(this.credentialState, this.imported, tenantId),
		};
		return work(session);
	}

	private noteKey(tenantId: string, did: string, link: DidKeyLink) {
		const key = `${tenantId}|${did}`;
		this.recorded.set(key, [...(this.recorded.get(key) ?? []), link.kmsKeyId]);
	}
}
