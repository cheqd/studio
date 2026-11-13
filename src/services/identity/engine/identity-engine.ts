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
	EngineSignedInput,
	EngineStatusListOptions,
	EngineStatusOptions,
	EngineStatusResult,
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
}
