import { randomUUID } from 'node:crypto';
import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../../../database/entities/key.entity.js';
import type { ExportDidResponse, ListDIDRequestOptions, ListDidsResponseBody } from '../../../../types/did.js';
import type {
	CredentialRequest,
	ListCredentialRequestOptions,
	ListCredentialResponse,
} from '../../../../types/credential.js';
import type { ListResourceOptions, ListResourceResponse } from '../../../../types/resource.js';
import type { IdentityEngine } from '../identity-engine.js';
import type {
	EngineCredential,
	EngineCredentialPayload,
	EngineDidDocument,
	EngineDidResolution,
	EngineDidResolutionOptions,
	EngineFeePaymentOptions,
	EngineIdentifier,
	EngineImportKey,
	EngineKeyInfo,
	EngineKeyType,
	EnginePresentation,
	EnginePresentationPayload,
	EngineResourcePayload,
	EngineSignRequest,
	EngineSignedInput,
	EngineStatusListOptions,
	EngineStatusOptions,
	EngineStatusResult,
	EngineVerificationOptions,
	EngineVerificationResult,
} from '../types.js';
import { CredoAccreditations } from './accreditation.js';
import { CredoCredentials } from './credentials.js';
import {
	CredoKeyExistsError,
	CredoNotSupportedError,
	CredoOwnershipError,
	NotImplementedByEngineError,
	asTenantMissing,
} from './errors.js';
import {
	authenticationMethods,
	buildDefaultDidDocument,
	exportKeyEncodings,
	generateKeyMaterial,
	IMPORTABLE_KEY_TYPES,
	keyMaterialFromPrivateKeyHex,
	publicKeyHexFromVerificationMethod,
	type GeneratedKey,
	type PrivateJwk,
} from './key-material.js';
import type { CredoEngineStore, CredoRuntime, DidKeyLink, StoredKey } from './ports.js';
import { CredoSigner } from './signing.js';
import { safeFetch as defaultSafeFetch, type SafeFetch } from '../../../../helpers/safe-fetch.js';
import { CredoStatusLists, type StatusListOwnership } from './status-lists.js';
import { deactivationGasLimit } from '../deactivation-gas.js';
import type { EngineAccreditationOutcome, EngineAccreditationVerifyRequest } from '../types.js';
import type {
	EngineTokenStatusList,
	EngineTokenStatusListOptions,
	EngineTokenStatusReading,
	EngineTokenStatusUpdate,
} from '../types.js';

const ENGINE = 'credo';
const NETWORKS = ['mainnet', 'testnet'];
const DEFAULT_RESOLVER_URL = 'https://resolver.cheqd.net/1.0/identifiers/';

export interface CredoEngineDependencies {
	store: CredoEngineStore;
	runtime: CredoRuntime;
	/** Runs `work` while holding the ledger lock for this payer address (see `ledger-lock.ts`). */
	withPayerLock: <T>(payerAddress: string, work: () => Promise<T>) => Promise<T>;
	resolverUrl?: string;
	fetch?: typeof fetch;
	/** The shared internal-destination block; for status lists hosted outside did:cheqd and Token Status Lists */
	safeFetch?: SafeFetch;
	statusListOwnership?: StatusListOwnership;
}

function didNetwork(did: string): string {
	const parts = did.split(':');
	if (parts.length !== 4 || parts[0] !== 'did' || parts[1] !== 'cheqd' || !NETWORKS.includes(parts[2])) {
		throw new Error(`'${did}' is not a did:cheqd identifier on mainnet or testnet`);
	}
	return parts[2];
}

/** The same runtime, except that a tenant missing from Askar surfaces as `CredoTenantMissingError`. */
function translateTenantErrors(runtime: CredoRuntime): CredoRuntime {
	const wrapped: CredoRuntime = Object.create(runtime);
	wrapped.withTenant = (tenantId, work) =>
		runtime.withTenant(tenantId, work).catch((error: unknown) => {
			throw asTenantMissing(tenantId, error);
		});
	return wrapped;
}

function requireCustomer(customer: CustomerEntity | undefined): string {
	if (!customer?.customerId) throw new Error('Customer not found');
	return customer.customerId;
}

/** A supplied private key as key material, or `NotSupported` for a type the key store cannot hold. */
function importableKey(type: EngineKeyType | string, privateKeyHex: string): GeneratedKey {
	if (!(IMPORTABLE_KEY_TYPES as readonly string[]).includes(type)) {
		throw new CredoNotSupportedError(`importing keys of type '${type}'`);
	}
	if (typeof privateKeyHex !== 'string') throw new Error(`The ${type} private key is missing`);
	return keyMaterialFromPrivateKeyHex(type as EngineKeyType, privateKeyHex);
}

/** `#fragment` for a verification method id given absolute (`did#fragment`) or relative. */
function relativeMethodId(did: string, id: string): string {
	return id.startsWith(did) ? id.slice(did.length) : id;
}

/**
 * The Credo implementation of `IdentityEngine` (migration plan, section 3, "Rules for the Credo engine").
 *
 * - One Credo tenant per Studio customer, created on the customer's first operation and recorded in
 *   `customer.credoTenantId`. The tenant id comes from the database, never from the request.
 * - The engine checks, itself, that every key and DID it touches belongs to the calling customer. It does not rely
 *   on the API layer having checked, and it answers from match counts and filtered single rows only.
 * - Every ledger write holds the payer's advisory lock from before signing until the broadcast completes.
 * - The fee payer is the customer's own payment account. The engine finds its address to lock on; the Credo cheqd
 *   module asks `payer.ts` for the signer through the `resolvePayer` hook.
 *
 * Credentials, presentations and signing delegate to `credentials.ts` and `signing.ts`, status lists to
 * `status-lists.ts`. The few methods not built yet throw `NotImplementedByEngine`.
 */
export class CredoEngine implements IdentityEngine {
	readonly name = ENGINE;

	private readonly store: CredoEngineStore;
	private readonly runtime: CredoRuntime;
	private readonly withPayerLock: CredoEngineDependencies['withPayerLock'];
	private readonly resolverUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly signer: CredoSigner;
	private readonly credentials: CredoCredentials;
	private readonly statusLists: CredoStatusLists;
	private readonly accreditations: CredoAccreditations;

	constructor(dependencies: CredoEngineDependencies) {
		this.store = dependencies.store;
		this.runtime = translateTenantErrors(dependencies.runtime);
		this.withPayerLock = dependencies.withPayerLock;
		this.resolverUrl = (dependencies.resolverUrl || DEFAULT_RESOLVER_URL).replace(/\/?$/, '/');
		this.fetchImpl = dependencies.fetch ?? fetch;
		this.signer = new CredoSigner(this.store, this.runtime, (customerId) => this.ensureTenant(customerId));
		this.credentials = new CredoCredentials({
			store: this.store,
			runtime: this.runtime,
			signer: this.signer,
			ensureTenant: (customerId) => this.ensureTenant(customerId),
			resolveUrl: (didUrl) => this.resolve(didUrl),
			statusEntries: {
				resolverUrl: this.resolverUrl,
				readStatusList: (did, name, listType, purpose) =>
					this.statusLists.searchStatusList(did, name, listType, purpose),
			},
		});
		this.statusLists = new CredoStatusLists({
			store: dependencies.store,
			runtime: this.runtime,
			ownership: dependencies.statusListOwnership,
			withPayerLock: dependencies.withPayerLock,
			ensureTenant: (customerId) => this.ensureTenant(customerId),
			safeFetch: dependencies.safeFetch ?? defaultSafeFetch,
			resolverUrl: this.resolverUrl,
		});
		this.accreditations = new CredoAccreditations({
			store: this.store,
			resolveUrl: (didUrl, dereferencing) => this.resolve(didUrl, dereferencing),
			resolveDid: (did) => this.resolveDid(did),
			verifyCredential: (credential, options, customer) =>
				this.credentials.verifyCredential(credential, options, customer),
		});
	}

	// ---------------------------------------------------------------- tenants

	/** The customer's Credo tenant id, creating the tenant on first use. */
	async ensureTenant(customerId: string): Promise<string> {
		const existing = await this.store.readTenantId(customerId);
		if (existing) return existing;

		return this.store.withTenantCreationLock(customerId, async () => {
			// Another instance may have created it while this one waited for the lock
			const created = await this.store.readTenantId(customerId);
			if (created) return created;

			const tenantId = await this.runtime.createTenant(`studio-customer:${customerId}`);
			try {
				await this.store.writeTenantId(customerId, tenantId);
			} catch (error) {
				// Do not leave a tenant nobody points at
				await this.runtime.deleteTenant(tenantId).catch(() => undefined);
				throw error;
			}
			return tenantId;
		});
	}

	// ------------------------------------------------------------------ keys

	async createKey(type: EngineKeyType | string, customer?: CustomerEntity, keyAlias?: string): Promise<KeyEntity> {
		const customerId = requireCustomer(customer);
		const key = generateKeyMaterial(type);
		const tenantId = await this.ensureTenant(customerId);

		await this.runtime.withTenant(tenantId, (session) => session.importKey(key.privateJwk, key.kid));
		await this.store.insertOwnedKey(customerId, {
			kid: key.kid,
			type: key.type,
			publicKeyHex: key.publicKeyHex,
			kms: 'postgres',
		});
		const stored = await this.store.finaliseOwnedKey(customerId, key.kid, keyAlias);
		if (!stored) throw new CredoOwnershipError(`Key ${key.kid}`);
		return stored as unknown as KeyEntity;
	}

	async deleteUnusedKey(kid: string, customer: CustomerEntity): Promise<boolean> {
		const customerId = requireCustomer(customer);
		// Studio's row first: it is the check that the customer owns the key and no DID uses it
		if (!(await this.store.deleteUnlinkedOwnedKey(customerId, kid))) return false;
		const tenantId = await this.ensureTenant(customerId);
		await this.runtime.withTenant(tenantId, (session) => session.deleteKey(kid));
		return true;
	}

	async getKey(kid: string, customer?: CustomerEntity): Promise<EngineKeyInfo | null> {
		// Without a customer there is nobody to prove ownership for
		if (!customer?.customerId) return null;
		return this.store.findOwnedKey(customer.customerId, { kid });
	}

	/** Every public key hex must be a key this customer owns. Refuses on the first one that is not. */
	private async assertPublicKeysOwned(customerId: string, publicKeyHexs: string[] | undefined): Promise<void> {
		for (const publicKeyHex of publicKeyHexs ?? []) {
			if (!(await this.store.findOwnedKey(customerId, { publicKeyHex }))) {
				throw new CredoOwnershipError(`Key ${publicKeyHex}`);
			}
		}
	}

	/** Maps each `authentication` entry of the document to a key this customer owns, or refuses. */
	private async linkSigningKeys(customerId: string, didDocument: EngineDidDocument): Promise<DidKeyLink[]> {
		const methods = authenticationMethods(didDocument);
		if (methods.length === 0)
			throw new Error('The DID document has no authentication verification method to sign with');

		const links: DidKeyLink[] = [];
		for (const method of methods) {
			if (!method.publicKeyHex) throw new Error(`Verification method ${method.id} has no usable public key`);
			const key = await this.store.findOwnedKey(customerId, { publicKeyHex: method.publicKeyHex });
			if (!key) throw new CredoOwnershipError(`Key ${method.publicKeyHex}`);
			links.push({ didDocumentRelativeKeyId: method.relativeId, kmsKeyId: key.kid });
		}
		return links;
	}

	/** The keys the tenant's own record of a DID signs with must all be this customer's. */
	private async assertRecordedKeysOwned(customerId: string, tenantId: string, did: string): Promise<void> {
		const recorded = await this.runtime.withTenant(tenantId, (session) => session.recordedKeyIds(did));
		if (recorded === null) throw new CredoOwnershipError(did);
		for (const kid of recorded) {
			if (!(await this.store.findOwnedKey(customerId, { kid }))) {
				throw new CredoOwnershipError(`Key ${kid}`);
			}
		}
	}

	// ------------------------------------------------------------------ DIDs

	private async payerFor(customerId: string, network: string): Promise<string> {
		const account = await this.store.findPayerAccount(customerId, network);
		if (!account) throw new Error(`No ${network} payment account for this customer, so there is no fee payer`);
		return account.address;
	}

	async createDid(
		network: string,
		didDocument: EngineDidDocument,
		customer: CustomerEntity
	): Promise<EngineIdentifier> {
		const customerId = requireCustomer(customer);
		if (!NETWORKS.includes(network)) throw new Error(`Unsupported network '${network}'`);
		if (didDocument.id && !didDocument.id.startsWith(`did:cheqd:${network}:`)) {
			throw new Error(`'${didDocument.id}' is not on ${network}`);
		}

		const payerAddress = await this.payerFor(customerId, network);
		const tenantId = await this.ensureTenant(customerId);

		let document = didDocument;
		let links: DidKeyLink[];
		const hasMethods = Array.isArray(didDocument.verificationMethod) && didDocument.verificationMethod.length > 0;
		if (hasMethods) {
			if (!didDocument.id) throw new Error('The DID document has no id');
			links = await this.linkSigningKeys(customerId, didDocument);
		} else {
			// Default identifier: P-256 `JsonWebKey` plus Ed25519 `Multikey`, both new keys of this customer
			const did = didDocument.id || `did:cheqd:${network}:${randomUUID()}`;
			const p256 = generateKeyMaterial('Secp256r1');
			const ed25519 = generateKeyMaterial('Ed25519');
			for (const key of [p256, ed25519]) {
				await this.runtime.withTenant(tenantId, (session) => session.importKey(key.privateJwk, key.kid));
				await this.store.insertOwnedKey(customerId, {
					kid: key.kid,
					type: key.type,
					publicKeyHex: key.publicKeyHex,
					kms: 'postgres',
				});
			}
			document = {
				...buildDefaultDidDocument(
					did,
					p256,
					ed25519,
					(didDocument.service as Record<string, unknown>[]) ?? []
				),
			};
			links = [
				{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: p256.kid },
				{ didDocumentRelativeKeyId: '#key-2', kmsKeyId: ed25519.kid },
			];
		}

		const result = await this.withPayerLock(payerAddress, () =>
			this.runtime.withTenant(tenantId, (session) =>
				session.createDid({ didDocument: document, network, keys: links })
			)
		);
		if (result.state !== 'finished')
			throw new Error(`Failed to create ${document.id}: ${result.reason ?? result.state}`);

		return this.store.saveIdentifier(customerId, {
			did: document.id,
			provider: `did:cheqd:${network}`,
			controllerKeyId: links[0].kmsKeyId,
			keyIds: links.map((link) => link.kmsKeyId),
			services: (document.service as Record<string, unknown>[]) ?? [],
		});
	}

	async updateDid(
		didDocument: EngineDidDocument,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<EngineIdentifier> {
		const customerId = requireCustomer(customer);
		const did = didDocument.id;
		const network = didNetwork(did);
		if (!(await this.store.isDidOwned(customerId, did))) throw new Error(`${did} not found in wallet`);
		await this.assertPublicKeysOwned(customerId, publicKeyHexs);

		const tenantId = await this.ensureTenant(customerId);
		await this.assertRecordedKeysOwned(customerId, tenantId, did);
		const payerAddress = await this.payerFor(customerId, network);

		const links = await this.linkSigningKeys(customerId, didDocument);
		// Keys that sign for authentication entries the update removes: linked when this customer holds them
		const previous = await this.runtime.resolveDid(did);
		if (previous.didDocument && !previous.didDocumentMetadata?.deactivated) {
			for (const method of authenticationMethods(previous.didDocument)) {
				if (!method.publicKeyHex || links.some((l) => l.didDocumentRelativeKeyId === method.relativeId))
					continue;
				const key = await this.store.findOwnedKey(customerId, { publicKeyHex: method.publicKeyHex });
				if (key) links.push({ didDocumentRelativeKeyId: method.relativeId, kmsKeyId: key.kid });
			}
		}

		const result = await this.withPayerLock(payerAddress, () =>
			this.runtime.withTenant(tenantId, (session) => session.updateDid({ did, didDocument, keys: links }))
		);
		if (result.state !== 'finished') throw new Error(`Failed to update ${did}: ${result.reason ?? result.state}`);

		const current = await this.store.getIdentifier(customerId, did);
		return this.store.saveIdentifier(customerId, {
			did,
			provider: `did:cheqd:${network}`,
			controllerKeyId: current?.controllerKeyId,
			keyIds: Array.from(new Set([...(current?.keys ?? []).map((k) => k.kid), ...links.map((l) => l.kmsKeyId)])),
			services: (didDocument.service as Record<string, unknown>[]) ?? [],
		});
	}

	async deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean> {
		const customerId = requireCustomer(customer);
		const network = didNetwork(did);
		if (!(await this.store.isDidOwned(customerId, did))) throw new Error(`${did} not found in wallet`);
		await this.assertPublicKeysOwned(customerId, publicKeyHexs);

		const tenantId = await this.ensureTenant(customerId);
		await this.assertRecordedKeysOwned(customerId, tenantId, did);

		const resolved = await this.runtime.resolveDid(did);
		if (!resolved.didDocument) throw new Error('DID document not found');
		// Already deactivated: nothing to do, same answer as the Veramo engine
		if (resolved.didDocumentMetadata?.deactivated) return true;

		// The ledger rewrites every version on deactivation, so the SDK's fixed gas limit is too low for a DID with
		// history (U-62). An unknown count falls back to a generous assumption inside `deactivationGasLimit`.
		const versionCount = await this.runtime.didVersionCount?.(did).catch(() => undefined);
		const gasLimit = deactivationGasLimit({ didDocument: resolved.didDocument, versionCount });

		const payerAddress = await this.payerFor(customerId, network);
		const result = await this.withPayerLock(payerAddress, () =>
			this.runtime.withTenant(tenantId, (session) => session.deactivateDid(did, { gasLimit }))
		);
		if (result.state !== 'finished')
			throw new Error(`Failed to deactivate ${did}: ${result.reason ?? result.state}`);
		return true;
	}

	async listDids(options: ListDIDRequestOptions, customer: CustomerEntity): Promise<ListDidsResponseBody> {
		return this.store.listIdentifiers(requireCustomer(customer), options);
	}

	async getDid(did: string, customer: CustomerEntity): Promise<unknown> {
		const identifier = await this.store.getIdentifier(requireCustomer(customer), did);
		if (!identifier) throw new Error(`Identifier ${did} not found`);
		return identifier;
	}

	async didExists(did: string, customer: CustomerEntity): Promise<boolean> {
		return this.store.isDidOwned(requireCustomer(customer), did);
	}

	resolveDid(did: string, options?: EngineDidResolutionOptions): Promise<EngineDidResolution> {
		return this.runtime.resolveDid(did, options);
	}

	resolve(didUrl: string, dereferencing = false): Promise<Response> {
		const headers: Record<string, string> = dereferencing
			? { Accept: 'application/ld+json;profile=https://w3id.org/did-url-dereferencing' }
			: { 'Content-Type': '*/*' };
		return this.fetchImpl(`${this.resolverUrl}${didUrl}`, { headers, keepalive: true });
	}

	// -------------------------------------------------------------- resources

	async createResource(
		network: string,
		payload: EngineResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<unknown> {
		const customerId = requireCustomer(customer);
		if (!NETWORKS.includes(network)) throw new Error(`Unsupported network '${network}'`);
		if (!payload.collectionId) throw new Error('collectionId is required to create a resource');
		const did = `did:cheqd:${network}:${payload.collectionId}`;
		if (!(await this.store.isDidOwned(customerId, did))) throw new Error(`${did} not found in wallet`);
		await this.assertPublicKeysOwned(customerId, publicKeyHexs);

		const tenantId = await this.ensureTenant(customerId);
		await this.assertRecordedKeysOwned(customerId, tenantId, did);
		const payerAddress = await this.payerFor(customerId, network);

		const result = await this.withPayerLock(payerAddress, () =>
			this.runtime.withTenant(tenantId, (session) =>
				session.createResource(did, {
					id: payload.id ?? randomUUID(),
					name: payload.name,
					resourceType: payload.resourceType,
					version: payload.version,
					alsoKnownAs: payload.alsoKnownAs as { uri: string; description: string }[] | undefined,
					data: payload.data as Uint8Array | string,
				})
			)
		);
		if (result.state !== 'finished') {
			throw new Error(`Failed to create the resource on ${did}: ${result.reason ?? result.state}`);
		}
		return true;
	}

	listResources(options: ListResourceOptions, customer: CustomerEntity): Promise<ListResourceResponse> {
		return this.store.listResources(requireCustomer(customer), options);
	}

	findLatestResourcesVersionsByType(
		resourceType: string,
		customer: CustomerEntity,
		network?: string,
		did?: string,
		page?: number,
		limit?: number
	): Promise<ListResourceResponse> {
		return this.accreditations.findLatestResourcesVersionsByType(resourceType, customer, network, did, page, limit);
	}

	// ------------------------------------------------------- import and export

	/**
	 * Puts a supplied key in Studio's key store, through the tenant's KMS (Veramo's `private-key` layout, so both
	 * engines can sign with it), and records it as this customer's `key` row. A key the customer already owns is left
	 * as it is. A key the store already holds for anyone else is refused: one customer never gets another's key row.
	 */
	private async storeImportedKey(customerId: string, tenantId: string, key: GeneratedKey): Promise<void> {
		if (await this.store.findOwnedKey(customerId, { kid: key.kid })) return;
		try {
			await this.runtime.withTenant(tenantId, (session) => session.importKey(key.privateJwk, key.kid));
		} catch (error) {
			if (error instanceof CredoKeyExistsError) throw new CredoOwnershipError(`Key ${key.kid}`);
			throw error;
		}
		await this.store.insertOwnedKey(customerId, {
			kid: key.kid,
			type: key.type,
			publicKeyHex: key.publicKeyHex,
			kms: 'postgres',
		});
	}

	async importKey(
		type: EngineKeyType | string,
		privateKeyHex: string,
		customer?: CustomerEntity,
		alias?: string
	): Promise<KeyEntity> {
		const customerId = requireCustomer(customer);
		const key = importableKey(type, privateKeyHex);
		const tenantId = await this.ensureTenant(customerId);
		await this.storeImportedKey(customerId, tenantId, key);
		// Alias and creation time, as the Veramo path sets them after its import
		const stored = await this.store.finaliseOwnedKey(customerId, key.kid, alias);
		if (!stored) throw new CredoOwnershipError(`Key ${key.kid}`);
		return stored as unknown as KeyEntity;
	}

	/**
	 * Takes over a did:cheqd DID that is already on the ledger: checks every supplied key belongs to the resolved
	 * document and that, with the keys the customer already holds, every authentication method can sign; stores the
	 * keys; records the DID in the customer's tenant with each method linked to its key by `kid`; and records the
	 * `identifier` row (engine `credo` for a new row). No ledger write. All the checks run before anything is written.
	 */
	async importDid(
		did: string,
		keys: EngineImportKey[],
		controllerKeyId: string | undefined,
		customer: CustomerEntity,
		provider?: string
	): Promise<EngineIdentifier & { status?: boolean }> {
		const customerId = requireCustomer(customer);
		if (!did.startsWith('did:cheqd:'))
			throw new CredoNotSupportedError('importing DIDs of methods other than cheqd');
		const network = didNetwork(did);
		if (provider && provider !== `did:cheqd:${network}`) {
			throw new Error(`Provider '${provider}' does not match ${did}`);
		}

		const resolved = await this.runtime.resolveDid(did);
		const didDocument = resolved.didDocument;
		if (!didDocument || didDocument.id !== did) throw new Error(`Error resolving ${did}`);
		if (resolved.didDocumentMetadata?.deactivated) throw new Error(`${did} is deactivated and cannot be imported`);

		// Every supplied key must be the key of one of the document's verification methods
		const methods = ((didDocument.verificationMethod as Record<string, unknown>[] | undefined) ?? []).map((vm) => ({
			relativeId: relativeMethodId(did, String(vm.id)),
			publicKeyHex: publicKeyHexFromVerificationMethod(vm),
		}));
		const documentKeys = new Set(methods.map((m) => m.publicKeyHex).filter((hex): hex is string => !!hex));
		const supplied = new Map<string, GeneratedKey>();
		(keys ?? []).forEach((input, index) => {
			const key = importableKey(input.type || 'Ed25519', input.privateKeyHex);
			if (!documentKeys.has(key.publicKeyHex)) {
				throw new Error(`Key ${index + 1} (${key.type}) is not the key of any verification method of ${did}`);
			}
			supplied.set(key.kid, key);
		});

		// Every authentication method must be signable once the supplied keys are stored, or Credo cannot update it
		const holds = async (publicKeyHex: string) =>
			[...supplied.values()].some((k) => k.publicKeyHex === publicKeyHex) ||
			(await this.store.findOwnedKey(customerId, { publicKeyHex })) !== null;
		const signing = authenticationMethods(didDocument);
		if (signing.length === 0) throw new Error(`${did} has no authentication verification method to sign with`);
		for (const method of signing) {
			if (!method.publicKeyHex) throw new Error(`Verification method ${method.id} has no usable public key`);
			if (!(await holds(method.publicKeyHex))) {
				throw new Error(
					`The keys must include the key of authentication method ${method.relativeId} of ${did}`
				);
			}
		}

		const tenantId = await this.ensureTenant(customerId);
		for (const key of supplied.values()) await this.storeImportedKey(customerId, tenantId, key);

		// The authentication methods, then every other method whose key this customer holds (issuing signs with those)
		const links = await this.linkSigningKeys(customerId, didDocument);
		for (const method of methods) {
			if (!method.publicKeyHex || links.some((l) => l.didDocumentRelativeKeyId === method.relativeId)) continue;
			const key = await this.store.findOwnedKey(customerId, { publicKeyHex: method.publicKeyHex });
			if (key) links.push({ didDocumentRelativeKeyId: method.relativeId, kmsKeyId: key.kid });
		}

		await this.runtime.withTenant(tenantId, (session) => session.importDid({ did, didDocument, keys: links }));

		const linkedKids = links.map((link) => link.kmsKeyId);
		return this.store.saveIdentifier(customerId, {
			did,
			provider: `did:cheqd:${network}`,
			controllerKeyId: controllerKeyId && linkedKids.includes(controllerKeyId) ? controllerKeyId : linkedKids[0],
			keyIds: Array.from(new Set(linkedKids)),
			services: (didDocument.service as Record<string, unknown>[]) ?? [],
		});
	}

	/**
	 * The DID document and the private key of each verification method, in the Veramo export's shape. The keys are
	 * read from Studio's key store, only for key rows this customer owns. `password` is unused here, as on the
	 * Veramo path: the controller encrypts the whole result (`respondWithEncryptedExport`). Nothing here is logged.
	 */
	async exportDid(did: string, _password: string, customer: CustomerEntity): Promise<ExportDidResponse> {
		const customerId = requireCustomer(customer);
		const identifier = await this.store.getIdentifier(customerId, did);
		// The Veramo path's answer, word for word, for a DID that does not exist and for one that is not this customer's
		if (!identifier) throw new Error(`${did} not found in wallet`);

		const { didDocument, didDocumentMetadata, didResolutionMetadata } = await this.runtime.resolveDid(did);
		if (!didDocument) throw new Error(`Error resolving ${did}`);

		const keys = await Promise.all(
			((didDocument.verificationMethod as Record<string, unknown>[] | undefined) ?? []).map(async (vm) => {
				const publicKeyHex = publicKeyHexFromVerificationMethod(vm);
				if (!publicKeyHex) throw new Error('Not supported');

				const existingKey = (identifier.keys ?? []).find(
					(k) => k.kid === publicKeyHex || k.publicKeyHex === publicKeyHex
				);
				if (!existingKey) throw new Error(`Key not found in wallet: ${publicKeyHex}`);

				const privateKey = await this.store.readOwnedPrivateKey(customerId, existingKey.kid);
				if (!privateKey) throw new Error(`Private key not found for kid: ${existingKey.kid}`);

				return {
					'@context': ['https://w3id.org/wallet/v1'],
					id: String(vm.id),
					type: [String(vm.type)],
					controller: String(vm.id),
					name: privateKey.alias,
					correlation: [String(vm.id)],
					created: new Date().toISOString(),
					...exportKeyEncodings(existingKey.publicKeyHex, privateKey.privateKeyHex),
				};
			})
		);

		return {
			'@context': ['https://w3id.org/wallet/v1', 'https://w3id.org/did-resolution/v1'],
			id: did,
			type: ['DIDResolutionResponse'],
			didDocument,
			didDocumentMetadata,
			didResolutionMetadata,
			keys,
		} as unknown as ExportDidResponse;
	}

	// ---------------------------------------------------------- accreditations

	verifyAccreditation(
		request: EngineAccreditationVerifyRequest,
		customer: CustomerEntity
	): Promise<EngineAccreditationOutcome> {
		return this.accreditations.verifyAccreditation(request, customer);
	}

	// ------------------------------------------------- not built yet (next agent)

	private notImplemented(method: string): Promise<never> {
		return Promise.reject(new NotImplementedByEngineError(ENGINE, method));
	}

	createCredential(
		credential: EngineCredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: EngineStatusOptions | null,
		customer: CustomerEntity
	): Promise<EngineCredential> {
		return this.credentials.createCredential(credential, format, statusOptions, customer);
	}
	verifyCredential(
		credential: EngineSignedInput,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult> {
		return this.credentials.verifyCredential(credential, options, customer);
	}
	createPresentation(
		presentation: EnginePresentationPayload,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EnginePresentation> {
		return this.credentials.createPresentation(presentation, options, customer);
	}
	verifyPresentation(
		presentation: EngineSignedInput,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult> {
		return this.credentials.verifyPresentation(presentation, options, customer);
	}
	listCredentials(options: ListCredentialRequestOptions, customer: CustomerEntity): Promise<ListCredentialResponse> {
		return this.credentials.listCredentials(options, customer);
	}
	getCredential(credentialId: string, customer: CustomerEntity): Promise<EngineCredential | null> {
		return this.credentials.getCredential(credentialId, customer);
	}
	saveCredential(credential: EngineCredential, customer: CustomerEntity): Promise<string> {
		return this.credentials.saveCredential(credential, customer);
	}
	retrieveCredential(hash: string, customer: CustomerEntity): Promise<EngineCredential | null> {
		return this.credentials.retrieveCredential(hash, customer);
	}
	deleteCredential(hash: string, customer: CustomerEntity): Promise<boolean> {
		return this.credentials.deleteCredential(hash, customer);
	}

	/** The raw JWS signature with the customer's DID key (ES256 or EdDSA). See `signing.ts`. */
	signWithDidKey(request: EngineSignRequest, customer: CustomerEntity): Promise<Uint8Array> {
		return this.signer.signWithDidKey(request, customer);
	}
	createUnencryptedStatusList2021(
		did: string,
		resource: EngineResourcePayload,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.createUnencryptedStatusList2021(did, resource, options, customer);
	}
	createUnencryptedBitstringStatusList(
		did: string,
		resource: EngineResourcePayload,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.createUnencryptedBitstringStatusList(did, resource, options, customer);
	}
	createEncryptedStatusList2021(
		did: string,
		resource: EngineResourcePayload,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.createEncryptedStatusList2021();
	}
	createEncryptedBitstringStatusList(
		did: string,
		resource: EngineResourcePayload,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.createEncryptedBitstringStatusList();
	}
	updateUnencryptedStatusList(
		did: string,
		listType: string,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.updateUnencryptedStatusList(did, listType, options, customer);
	}
	updateEncryptedStatusList(
		did: string,
		listType: string,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.updateEncryptedStatusList();
	}
	checkStatusList2021(
		did: string,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.checkStatusList2021(did, options, customer);
	}
	checkBitstringStatusList(
		did: string,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult | EngineStatusResult[]> {
		return this.statusLists.checkBitstringStatusList(did, options, customer);
	}
	searchStatusList(
		did: string,
		statusListName: string,
		listType: string,
		statusPurpose?: 'revocation' | 'suspension',
		customer?: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.statusLists.searchStatusList(did, statusListName, listType, statusPurpose);
	}
	broadcastStatusList2021(
		_did: string,
		_resource: EngineResourcePayload,
		_options: EngineStatusListOptions,
		_customer: CustomerEntity
	): Promise<boolean> {
		return this.notImplemented('broadcastStatusList2021');
	}
	broadcastBitstringStatusList(
		_did: string,
		_resource: EngineResourcePayload,
		_customer: CustomerEntity
	): Promise<boolean> {
		return this.notImplemented('broadcastBitstringStatusList');
	}
	createTokenStatusList(
		did: string,
		options: EngineTokenStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineTokenStatusList> {
		return this.statusLists.createTokenStatusList(did, options, customer);
	}
	setTokenStatus(
		did: string,
		listUri: string,
		updates: EngineTokenStatusUpdate[],
		customer: CustomerEntity
	): Promise<void> {
		return this.statusLists.setTokenStatus(did, listUri, updates, customer);
	}
	getTokenStatus(listUri: string, index: number): Promise<EngineTokenStatusReading> {
		return this.statusLists.getTokenStatus(listUri, index);
	}
	remunerateStatusList2021(
		_options: EngineFeePaymentOptions,
		_customer?: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.notImplemented('remunerateStatusList2021');
	}
	revokeCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult> {
		return this.statusLists.revokeCredentials(credential, listType, publish, customer, symmetricKey);
	}
	suspendCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult> {
		return this.statusLists.suspendCredentials(credential, listType, publish, customer, symmetricKey);
	}
	reinstateCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult> {
		return this.statusLists.reinstateCredentials(credential, listType, publish, customer, symmetricKey);
	}
}

export type { PrivateJwk, StoredKey };
