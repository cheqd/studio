import type { EngineSigningAlg, JsonObject } from '../types.js';

/**
 * The parts of the Credo ports that credentials, presentations and signing need. They live here, and
 * `CredoEngineStore` and `CredoTenantSession` extend them in `ports.ts`, so this work and the status-list work
 * (`status-lists.ts`) each add to their own interface.
 */

export interface CredentialResourceQuery {
	issuerId?: string;
	page?: number;
	limit?: number;
	resourceTypes: string[];
}

export interface CredentialResourceRow {
	/** The DID the resource lives under */
	did: string;
	resourceId: string;
}

export interface CredentialResourcePage {
	total: number;
	resources: CredentialResourceRow[];
}

/** Studio tables the credential operations read. Every method is scoped to the customer in the query. */
export interface CredentialStore {
	/** The customer's credential resources (linked resources whose type is a credential type). */
	listCredentialResources(customerId: string, options: CredentialResourceQuery): Promise<CredentialResourcePage>;
	/** One of the customer's resources by id, or null when it is missing or belongs to someone else. */
	findOwnedResource(customerId: string, resourceId: string): Promise<CredentialResourceRow | null>;
}

/** One check Credo ran, flattened: `signature`, `issuerIsSigner`, `credentials[0].signature`, ... */
export interface CredoVerificationCheck {
	name: string;
	isValid: boolean;
	error?: string;
}

export interface CredoVerification {
	isValid: boolean;
	checks: CredoVerificationCheck[];
	/** Set when the whole verification failed before any check ran */
	error?: string;
	/** JSON-LD terms no `@context` defines: their values are not covered by the signature */
	undefinedTerms?: string[];
	/** The verification method that signed, when Credo could tell (JWT with a DID URL `kid`) */
	signer?: JsonObject;
}

/** The status of one entry of a credential's `credentialStatus` (the fields of Credo's `LegacyStatusResult`). */
export interface LegacyStatusOutcome {
	type: string;
	statusPurpose: string;
	statusListIndex: number;
	status: number;
	valid: boolean;
	revoked: boolean;
	suspended: boolean;
	message?: string;
	statusListCredential: string;
}

export interface CredentialSession {
	/**
	 * Signs with a key in the KMS (Studio's key store through the adapter). The caller has already proved the key is
	 * the customer's. ES256 returns the 64-byte `r || s` form a JWS carries, EdDSA the 64-byte Ed25519 signature.
	 */
	sign(input: { keyId: string; alg: EngineSigningAlg; data: Uint8Array }): Promise<Uint8Array>;
	/**
	 * Signs a JSON-LD credential with a DID this tenant created (Credo finds the signing key in its own record of the
	 * DID). Nothing is stored: the signed credential is returned and Credo keeps no copy.
	 */
	signJsonLdCredential(input: {
		credential: JsonObject;
		verificationMethod: string;
		proofType: string;
	}): Promise<JsonObject>;
	/** Verifies a JWT credential (compact) or a JSON-LD credential. Credo's own status check is never run. */
	verifyCredential(input: {
		credential: string | JsonObject;
		allowUndefinedTerms: boolean;
	}): Promise<CredoVerification>;
	/** Verifies a JWT presentation (compact) or a JSON-LD presentation, with the credentials inside it. */
	verifyPresentation(input: {
		presentation: string | JsonObject;
		challenge?: string;
		domain?: string;
		allowUndefinedTerms: boolean;
	}): Promise<CredoVerification>;
	/** Reads the status of a credential's legacy (StatusList2021 or Bitstring) entries. Throws if a list cannot be read. */
	checkLegacyCredentialStatus(credential: {
		issuer: string | { id: string };
		credentialStatus: JsonObject | JsonObject[];
	}): Promise<LegacyStatusOutcome[]>;
	/** Stores a credential in this tenant's holder records under `id`. Never used when issuing. */
	storeCredential(id: string, credential: string | JsonObject): Promise<void>;
	/** A credential in this tenant's holder records, as it was stored, or null. */
	getStoredCredential(id: string): Promise<string | JsonObject | null>;
	/** Deletes a credential from this tenant's holder records. False when there was none. */
	deleteStoredCredential(id: string): Promise<boolean>;
}
