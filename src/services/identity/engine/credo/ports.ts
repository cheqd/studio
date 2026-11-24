import type { ListDIDRequestOptions, ListDidsResponseBody } from '../../../../types/did.js';
import type { ListResourceOptions, ListResourceResponse } from '../../../../types/resource.js';
import type { EngineDidDocument, EngineDidResolution, EngineIdentifier, EngineKeyInfo } from '../types.js';
import type { CredentialSession, CredentialStore } from './credential-ports.js';
import type { PrivateJwk } from './key-material.js';
import type { LedgerResourceRead, RawTokenStatusList, StatusListSession } from './status-list-types.js';

/**
 * The two seams of the Credo engine. The engine holds Studio's rules (ownership, payer, locking, persistence);
 * these ports hold everything that touches Postgres or Credo, so the rules can be tested without either.
 */

/** A key row as Studio keeps it (`key` table). */
export interface StoredKey extends EngineKeyInfo {
	kid: string;
	type: string;
	publicKeyHex: string;
}

export interface PayerAccount {
	address: string;
	/** The `key` row holding the payer's private key */
	kid: string;
}

export interface IdentifierRecord {
	did: string;
	/** `did:cheqd:<network>` */
	provider: string;
	controllerKeyId?: string;
	keyIds: string[];
	services: Record<string, unknown>[];
}

/**
 * Persistence for the Credo engine. Every method that takes a `customerId` MUST scope its query to that
 * customer and answer from the match count or a single filtered row. None may infer "found" from the shape of a
 * result (an empty `[]` and a `[rows, count]` pair are both truthy; that is the bug class in plan section 7.1).
 */
export interface CredoEngineStore extends CredentialStore {
	// Tenants
	readTenantId(customerId: string): Promise<string | null>;
	writeTenantId(customerId: string, tenantId: string): Promise<void>;
	/** Serialises tenant creation for one customer across instances. */
	withTenantCreationLock<T>(customerId: string, work: () => Promise<T>): Promise<T>;
	findCustomerIdByTenantId(tenantId: string): Promise<string | null>;

	// Keys
	findOwnedKey(customerId: string, by: { kid: string } | { publicKeyHex: string }): Promise<StoredKey | null>;
	/** Inserts the `key` row for a key Credo has just created, owned by the customer. Idempotent on `kid`. */
	insertOwnedKey(customerId: string, key: StoredKey): Promise<void>;
	/** Sets alias and creation time on an owned key and returns the row; null if the customer does not own it. */
	finaliseOwnedKey(customerId: string, kid: string, alias?: string): Promise<StoredKey | null>;

	/**
	 * The decrypted private key of a key this customer owns, read from Studio's key store, or null when the customer
	 * does not own the key or the store holds no private material for it. For DID export only; never log the result.
	 */
	readOwnedPrivateKey(customerId: string, kid: string): Promise<{ alias: string; privateKeyHex: string } | null>;

	/** Deletes an owned key row that no identifier uses. True when a row was deleted. Scoped to the customer. */
	deleteUnlinkedOwnedKey(customerId: string, kid: string): Promise<boolean>;

	// DIDs
	isDidOwned(customerId: string, did: string): Promise<boolean>;
	getIdentifier(customerId: string, did: string): Promise<EngineIdentifier | null>;
	saveIdentifier(customerId: string, record: IdentifierRecord): Promise<EngineIdentifier>;
	listIdentifiers(customerId: string, options: ListDIDRequestOptions): Promise<ListDidsResponseBody>;

	// Resources
	listResources(customerId: string, options: ListResourceOptions): Promise<ListResourceResponse>;

	/** The latest version of each of the customer's resources of one type, newest first. Scoped to the customer. */
	findLatestResourcesVersionsByType(
		customerId: string,
		resourceType: string,
		network?: string,
		did?: string,
		page?: number,
		limit?: number
	): Promise<ListResourceResponse>;

	// Payment accounts
	findPayerAccount(customerId: string, network: string): Promise<PayerAccount | null>;
	/** The decrypted private key (hex) of a payment account's key, read through Studio's existing private key store. */
	readPayerPrivateKeyHex(kid: string): Promise<string | null>;
}

export interface DidOperationResult {
	state: string;
	reason?: string;
	didDocument?: EngineDidDocument;
}

export interface DidKeyLink {
	/** `#fragment` of the verification method in the DID document */
	didDocumentRelativeKeyId: string;
	kmsKeyId: string;
}

export interface ResourceInput {
	id: string;
	name: string;
	resourceType: string;
	version?: string;
	alsoKnownAs?: { uri: string; description: string }[];
	data: Uint8Array | string;
}

/** One customer's Credo tenant, for the length of one operation. */
export interface CredoTenantSession extends CredentialSession {
	createDid(input: {
		didDocument: EngineDidDocument;
		network: string;
		keys: DidKeyLink[];
	}): Promise<DidOperationResult>;
	updateDid(input: { did: string; didDocument: EngineDidDocument; keys: DidKeyLink[] }): Promise<DidOperationResult>;
	/** `gasLimit` overrides the SDK's fixed deactivation gas limit; the fee amount stays the SDK's (U-62). */
	deactivateDid(did: string, options?: { gasLimit?: string }): Promise<DidOperationResult>;
	createResource(did: string, resource: ResourceInput): Promise<{ state: string; reason?: string }>;
	/**
	 * Records a DID that already exists on the ledger as one this tenant controls (Credo's `dids.import`), with the
	 * KMS key ids of the methods it signs with. A local write only: nothing goes to the ledger. Replaces the tenant's
	 * earlier record of the same DID.
	 */
	importDid(input: { did: string; didDocument: EngineDidDocument; keys: DidKeyLink[] }): Promise<void>;
	/**
	 * Imports a private key into the KMS (and so into Studio's key store through the adapter) under `keyId`.
	 * Rejects with `CredoKeyExistsError` when the key store already holds that key id.
	 */
	importKey(privateJwk: PrivateJwk, keyId: string): Promise<void>;
	/** Deletes a key from the KMS (and so its private material from Studio's key store). */
	deleteKey(keyId: string): Promise<void>;
	/** The KMS key ids this tenant's record of the DID signs with, or null when the tenant never created the DID. */
	recordedKeyIds(did: string): Promise<string[] | null>;
	/** The service entries of the tenant's record of the DID. */
	recordedServices(did: string): Promise<Record<string, unknown>[]>;
	/** Signing for status lists (see `status-lists.ts`). Absent on runtimes that do not support them. */
	statusLists?: StatusListSession;
}

export interface CredoRuntime {
	createTenant(label: string): Promise<string>;
	deleteTenant(tenantId: string): Promise<void>;
	withTenant<T>(tenantId: string, work: (session: CredoTenantSession) => Promise<T>): Promise<T>;
	/** Public resolution: needs no tenant. */
	resolveDid(did: string, options?: Record<string, unknown>): Promise<EngineDidResolution>;
	/** Public read of a linked resource by DID URL, straight from the ledger (status lists). Needs no tenant. */
	readResource?(didUrl: string): Promise<LedgerResourceRead>;
	/** Public read of a Token Status List's stored bytes, or null when there is none. Needs no tenant. */
	readTokenStatusList?(did: string, name: string): Promise<RawTokenStatusList | null>;
	/** How many versions of the DID document the ledger holds. Needs no tenant. */
	didVersionCount?(did: string): Promise<number>;
	shutdown(): Promise<void>;
}

export type { EngineKeyInfo };
