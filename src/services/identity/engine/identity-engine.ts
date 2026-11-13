import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../../database/entities/key.entity.js';
import type { ExportDidResponse, ListDIDRequestOptions, ListDidsResponseBody } from '../../../types/did.js';
import type {
	CredentialRequest,
	ListCredentialRequestOptions,
	ListCredentialResponse,
} from '../../../types/credential.js';
import type { ListResourceOptions, ListResourceResponse } from '../../../types/resource.js';
import type {
	EngineAccreditationOutcome,
	EngineAccreditationVerifyRequest,
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
	EngineName,
	EnginePresentation,
	EnginePresentationPayload,
	EngineResourcePayload,
	EngineSignRequest,
	EngineSignedInput,
	EngineStatusListOptions,
	EngineStatusOptions,
	EngineStatusResult,
	EngineTokenStatusList,
	EngineTokenStatusListOptions,
	EngineTokenStatusReading,
	EngineTokenStatusUpdate,
	EngineVerificationOptions,
	EngineVerificationResult,
} from './types.js';

/**
 * The seam between Studio (authentication, tenancy, billing, flags, audit) and whatever signs and verifies:
 * Veramo today, Credo next. Implementations must check that every key and DID they touch belongs to the
 * calling customer.
 *
 * Deliberately not here: API keys, operation logs and payment accounts. They are Studio concerns, not
 * identity-engine concerns (see `StudioAccountServices` in `../studio-services.ts`).
 */
export interface IdentityEngine {
	readonly name: EngineName;

	// Keys
	createKey(type: EngineKeyType | string, customer?: CustomerEntity, keyAlias?: string): Promise<KeyEntity>;
	importKey(
		type: EngineKeyType | string,
		privateKeyHex: string,
		customer?: CustomerEntity,
		keyAlias?: string
	): Promise<KeyEntity>;
	getKey(kid: string, customer?: CustomerEntity): Promise<EngineKeyInfo | null>;

	// DIDs
	createDid(network: string, didDocument: EngineDidDocument, customer: CustomerEntity): Promise<EngineIdentifier>;
	updateDid(
		didDocument: EngineDidDocument,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<EngineIdentifier>;
	deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean>;
	importDid(
		did: string,
		keys: EngineImportKey[],
		controllerKeyId: string | undefined,
		customer: CustomerEntity,
		provider?: string
	): Promise<EngineIdentifier & { status?: boolean }>;
	exportDid(did: string, password: string, customer: CustomerEntity): Promise<ExportDidResponse>;
	listDids(options: ListDIDRequestOptions, customer: CustomerEntity): Promise<ListDidsResponseBody>;
	getDid(did: string, customer: CustomerEntity): Promise<unknown>;
	didExists(did: string, customer: CustomerEntity): Promise<boolean>;
	resolveDid(did: string, options?: EngineDidResolutionOptions): Promise<EngineDidResolution>;
	/** Dereference a DID URL; returns the raw HTTP response, as the resolver does today. */
	resolve(didUrl: string, dereferencing?: boolean): Promise<Response>;

	// Linked resources
	createResource(
		network: string,
		payload: EngineResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<unknown>;
	listResources(options: ListResourceOptions, customer: CustomerEntity): Promise<ListResourceResponse>;
	/**
	 * The latest version of each of the customer's resources of one type (a read of Studio's own `resource` table,
	 * newest first, paged). Used to list accreditations. Scoped to the customer in the query.
	 */
	findLatestResourcesVersionsByType(
		resourceType: string,
		customer: CustomerEntity,
		network?: string,
		did?: string,
		page?: number,
		limit?: number
	): Promise<ListResourceResponse>;

	// Credentials and presentations
	createCredential(
		credential: EngineCredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: EngineStatusOptions | null,
		customer: CustomerEntity
	): Promise<EngineCredential>;
	verifyCredential(
		credential: EngineSignedInput,
		verificationOptions: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult>;
	createPresentation(
		presentation: EnginePresentationPayload,
		verificationOptions: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EnginePresentation>;
	verifyPresentation(
		presentation: EngineSignedInput,
		verificationOptions: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult>;
	listCredentials(options: ListCredentialRequestOptions, customer: CustomerEntity): Promise<ListCredentialResponse>;
	getCredential(credentialId: string, customer: CustomerEntity): Promise<EngineCredential | null>;
	saveCredential(credential: EngineCredential, customer: CustomerEntity): Promise<string>;
	retrieveCredential(hash: string, customer: CustomerEntity): Promise<EngineCredential | null>;
	deleteCredential(hash: string, customer: CustomerEntity): Promise<boolean>;

	// Accreditations (trust chains)
	/**
	 * Resolves the accreditation at `didUrl`, checks its subject and `accreditedFor`, whether its issuer DIDs are
	 * deactivated and its signature and (optionally) status, then follows `termsOfUse.parentAccreditation` up to the
	 * root authorisation. Never throws for a chain that does not hold: that is an outcome with `success: false`.
	 */
	verifyAccreditation(
		request: EngineAccreditationVerifyRequest,
		customer: CustomerEntity
	): Promise<EngineAccreditationOutcome>;

	// Status lists
	createUnencryptedStatusList2021(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	createUnencryptedBitstringStatusList(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	createEncryptedBitstringStatusList(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	updateUnencryptedStatusList(
		did: string,
		listType: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	updateEncryptedStatusList(
		did: string,
		listType: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	checkStatusList2021(
		did: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult>;
	checkBitstringStatusList(
		did: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult | EngineStatusResult[]>;
	searchStatusList(
		did: string,
		statusListName: string,
		listType: string,
		statusPurpose?: 'revocation' | 'suspension',
		customer?: CustomerEntity
	): Promise<EngineStatusResult>;
	broadcastStatusList2021(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<boolean>;
	broadcastBitstringStatusList(
		did: string,
		resourceOptions: EngineResourcePayload,
		customer: CustomerEntity
	): Promise<boolean>;
	remunerateStatusList2021(
		feePaymentOptions: EngineFeePaymentOptions,
		customer?: CustomerEntity
	): Promise<EngineStatusResult>;
	revokeCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult>;
	suspendCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult>;
	reinstateCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult>;

	// Agent capabilities. Optional until the Credo engine implements them; the agent endpoints check for each one
	// and answer 501 when it is missing. See `AgentService` (src/services/agent).

	/**
	 * Sign raw bytes with the private key behind a verification method of one of the customer's DIDs, and return
	 * the raw JWS signature (ES256: 64 bytes r||s; EdDSA: 64 bytes). Used for the A2A agent card JWS and for
	 * SD-JWT VC issuance (AP2 open mandates, authority credentials). The private key never leaves the engine.
	 */
	signWithDidKey?(request: EngineSignRequest, customer: CustomerEntity): Promise<Uint8Array>;
	/** Create a Token Status List under one of the customer's DIDs and host it (a DID-Linked Resource). */
	createTokenStatusList?(
		did: string,
		options: EngineTokenStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineTokenStatusList>;
	/** Set one or more entries of a Token Status List the customer owns, then republish it. */
	setTokenStatus?(
		did: string,
		listUri: string,
		updates: EngineTokenStatusUpdate[],
		customer: CustomerEntity
	): Promise<void>;
	/**
	 * Read one entry of any Token Status List, fetched through the shared internal-destination block. Takes no
	 * customer: a verifier checks lists issued by other tenants. Must report `verified: false` rather than throw
	 * when the list is unreachable or its signature does not check out.
	 */
	getTokenStatus?(listUri: string, index: number): Promise<EngineTokenStatusReading>;
}
