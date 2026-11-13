/**
 * Engine-neutral data types for the IdentityEngine interface.
 *
 * Nothing in this file may import from `@veramo/*` or `@cheqd/did-provider-cheqd`. The shapes describe what
 * Studio's callers read today; the index signatures keep engine-specific extras flowing through unchanged, so
 * the REST responses of the Veramo engine stay byte-for-byte the same.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };
export type JsonObject = { [key: string]: JsonValue | undefined };

/** The engines Studio can route to. `veramo` is the only one that is live today. */
export const ENGINE_NAMES = ['veramo', 'credo'] as const;
export type EngineName = (typeof ENGINE_NAMES)[number];
export const DEFAULT_ENGINE: EngineName = 'veramo';

export function isEngineName(value: unknown): value is EngineName {
	return typeof value === 'string' && (ENGINE_NAMES as readonly string[]).includes(value);
}

export type EngineKeyType = 'Ed25519' | 'Secp256k1' | 'Secp256r1' | 'X25519';

export interface EngineKeyInfo {
	kid: string;
	type: EngineKeyType | string;
	publicKeyHex: string;
	kms?: string;
	meta?: JsonObject | null;
	[extra: string]: unknown;
}

export interface EngineDidDocument {
	id: string;
	[property: string]: unknown;
}

export interface EngineIdentifier {
	did: string;
	provider?: string;
	alias?: string;
	controllerKeyId?: string;
	keys?: EngineKeyInfo[];
	services?: JsonObject[];
	[extra: string]: unknown;
}

export interface EngineDidResolutionOptions {
	resourceMetadata?: boolean;
	accept?: string;
	[option: string]: unknown;
}

export interface EngineDidResolution {
	didDocument: EngineDidDocument | null;
	didDocumentMetadata: JsonObject;
	didResolutionMetadata: JsonObject;
}

export interface EngineImportKey {
	privateKeyHex: string;
	type: EngineKeyType | string;
}

/** A credential or presentation payload before signing. */
export type EngineCredentialPayload = JsonObject;
export type EnginePresentationPayload = JsonObject;

/** A signed credential (JSON-LD object, or JWT carried in `proof.jwt`) or presentation. */
export type EngineCredential = JsonObject;
export type EnginePresentation = JsonObject;
/** A credential or presentation as a caller sent it: a document or a compact JWT string. */
export type EngineSignedInput = EngineCredential | string;

export interface EngineVerificationOptions {
	fetchRemoteContexts?: boolean;
	domain?: string;
	verifyStatus?: boolean;
	policies?: JsonObject;
	allowDeactivatedDid?: boolean;
}

export interface EngineVerificationResult {
	verified: boolean;
	error?: { message?: string; errorCode?: string; [extra: string]: unknown };
	payload?: JsonObject;
	didResolutionResult?: JsonObject;
	issuer?: string;
	signer?: JsonObject;
	jwt?: string;
	verifiableCredential?: EngineCredential;
	[extra: string]: unknown;
}

export interface EngineResourcePayload {
	id?: string;
	collectionId?: string;
	name: string;
	resourceType: string;
	version?: string;
	alsoKnownAs?: JsonObject[];
	data?: Uint8Array | string;
	[extra: string]: unknown;
}

/** The outcome of a status-list write or read. The engine fills the fields it knows; callers pick what they need. */
export interface EngineStatusResult {
	created?: boolean;
	updated?: boolean;
	error?: string;
	resource?: JsonObject;
	resourceMetadata?: JsonObject;
	symmetricKey?: string;
	[extra: string]: unknown;
}

export type EngineStatusListOptions = JsonObject;
export type EngineStatusOptions = JsonObject;
export type EngineFeePaymentOptions = JsonObject;

export type EngineCredentialFormat = 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds' | string;

/**
 * Where an engine decision is being made. Route families are the unit of a feature flag: a flag with
 * `route: 'did'` switches DID creation, and `route: null` switches everything.
 */
export const ENGINE_ROUTES = ['did', 'resource', 'credential', 'status-list', 'key', 'presentation', 'verify'] as const;
export type EngineRoute = (typeof ENGINE_ROUTES)[number];

/**
 * Route families the router knows. `agent` is not in `ENGINE_ROUTES` on purpose: ENGINE_ROUTES are the families a
 * feature flag may switch, and the agent families are Credo-only (engine spec 4.1), so no flag can exist for them.
 */
export type RoutedFamily = EngineRoute | 'agent';

export type ArtifactKind = 'did' | 'status-list' | 'credential';

/** A reference to an artifact that already exists, so its recorded engine can be looked up. */
export interface ArtifactRef {
	kind: ArtifactKind;
	/** DID for `did`, `statusListId` (or provider list id) for `status-list`, `issuedCredentialId` for `credential`. */
	id: string;
}

// --- Agent capabilities -------------------------------------------------------------------------------------
// Used by the agent endpoints (`AgentService`). The matching `IdentityEngine` methods are optional: the Veramo
// engine does not have them, so the agent endpoints answer 501 for a customer who is not on the Credo engine.

/** JWS algorithms the agent endpoints sign with: P-256 is the default, Ed25519 is the second key. */
export type EngineSigningAlg = 'ES256' | 'EdDSA';

export interface EngineSignRequest {
	/** The DID whose key signs. The engine checks it belongs to the calling customer. */
	did: string;
	/** The verification method DID URL of the signing key, for example `did:cheqd:testnet:<id>#key-1`. */
	kid: string;
	alg: EngineSigningAlg;
	/** The exact bytes to sign (for a JWS: the ASCII of `base64url(header).base64url(payload)`). */
	data: Uint8Array;
}

/** Token Status List values (draft-ietf-oauth-status-list): 0 valid, 1 invalid (revoked), 2 suspended. */
export type EngineTokenStatus = 0 | 1 | 2;

export interface EngineTokenStatusListOptions {
	/** Resource name of the list under the issuer DID. */
	name: string;
	/** Bits per status entry: 1, 2, 4 or 8. Default 2 (valid, revoked, suspended). */
	bits?: 1 | 2 | 4 | 8;
	/** Number of entries. Default 131072, the size of the existing Studio lists. */
	size?: number;
	/** Seconds a verifier may cache the list (the `ttl` claim). */
	ttlSeconds?: number;
}

export interface EngineTokenStatusList {
	/** The URI that goes in the credential's `status.status_list.uri`. */
	uri: string;
	name: string;
	bits: 1 | 2 | 4 | 8;
	size: number;
	/** The DID-Linked Resource id when the list is hosted as one. */
	resourceId?: string;
}

export interface EngineTokenStatusUpdate {
	index: number;
	status: EngineTokenStatus;
}

export interface EngineTokenStatusReading {
	status: EngineTokenStatus | number;
	/** False when the list could not be fetched or its signature did not verify; the verifier must fail closed. */
	verified: boolean;
	error?: string;
}
