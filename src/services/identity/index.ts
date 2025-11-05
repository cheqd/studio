/* eslint-disable @typescript-eslint/no-explicit-any */
import * as dotenv from 'dotenv';
import { LocalIdentityService, PostgresIdentityService } from './providers/index.js';
import { Unauthorized } from './providers/studio/unauthorized.js';

import type {
	CredentialPayload,
	DIDDocument,
	DIDResolutionResult,
	IIdentifier,
	IKey,
	IVerifyResult,
	ManagedKeyInfo,
	PresentationPayload,
	TAgent,
	VerifiableCredential,
	VerifiablePresentation,
	W3CVerifiableCredential,
} from '@veramo/core';
import type {
	ResourcePayload,
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	CreateStatusList2021Result,
	RevocationResult,
	StatusCheckResult,
	SuspensionResult,
	UnsuspensionResult,
	TransactionResult,
	CreateStatusListResult,
	BulkBitstringUpdateResult,
	BitstringUpdateResult,
	BitstringValidationResult,
} from '@cheqd/did-provider-cheqd';
import type { VeramoAgent } from '../../types/shared.js';
import type { VerificationOptions } from '../../types/shared.js';
import type {
	CheqdCredentialStatus,
	CreateEncryptedBitstringOptions,
	CreateUnencryptedBitstringOptions,
	FeePaymentOptions,
} from '../../types/credential-status.js';
import type {
	CredentialRequest,
	ListCredentialRequestOptions,
	ListCredentialResponse,
} from '../../types/credential.js';
import type { CheckStatusListOptions } from '../../types/credential-status.js';
import type { StatusOptions } from '../../types/credential-status.js';
import type {
	BroadcastStatusListOptions,
	CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions,
	SearchStatusListResult,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
} from '../../types/credential-status.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../database/entities/key.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import type { APIKeyEntity } from '../../database/entities/api.key.entity.js';
import type { SupportedKeyTypes } from '@veramo/utils';
import { ExportDidResponse, ListDIDRequestOptions, ListDidsResponseBody } from '../../types/did.js';
import { ListResourceOptions, ListResourceResponse } from '../../types/resource.js';
import { ListOperationOptions } from '../../types/track.js';

dotenv.config();

// ToDo: get rid of this interface
// Move it to the abstract factory

export interface IIdentityService {
	agent?: VeramoAgent;

	initAgent(): TAgent<any>;
	createAgent?(customer: CustomerEntity): Promise<VeramoAgent>;
	createKey(type: SupportedKeyTypes, customer?: CustomerEntity, keyAlias?: string): Promise<KeyEntity>;
	importKey(
		type: SupportedKeyTypes,
		privateKeyHex: string,
		customer?: CustomerEntity,
		keyAlias?: string
	): Promise<KeyEntity>;
	getKey(kid: string, customer?: CustomerEntity): Promise<ManagedKeyInfo | null>;
	createDid(network: string, didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier>;
	updateDid(didDocument: DIDDocument, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<IIdentifier>;
	deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean>;
	listDids(options: ListDIDRequestOptions, customer: CustomerEntity): Promise<ListDidsResponseBody>;
	resolveDid(did: string): Promise<DIDResolutionResult>;
	exportDid(did: string, password: string, customer: CustomerEntity): Promise<ExportDidResponse>;
	resolve(didUrl: string): Promise<Response>;
	getDid(did: string, customer: CustomerEntity): Promise<any>;
	importDid(
		did: string,
		keys: Pick<IKey, 'privateKeyHex' | 'type'>[],
		controllerKeyId: string | undefined,
		customer: CustomerEntity,
		provider?: string
	): Promise<IIdentifier & { status?: boolean }>;
	createResource(
		network: string,
		payload: ResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<any>;
	listResources(options: ListResourceOptions, customer: CustomerEntity): Promise<ListResourceResponse>;
	createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		customer: CustomerEntity
	): Promise<VerifiableCredential>;
	verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult>;
	listCredentials(options: ListCredentialRequestOptions, customer: CustomerEntity): Promise<ListCredentialResponse>;
	getCredential(credentialId: string, customer: CustomerEntity): Promise<VerifiableCredential | null>;
	createPresentation(
		presentation: PresentationPayload,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<VerifiablePresentation>;
	verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult>;
	createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result>;
	createUnencryptedBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedBitstringOptions,
		customer: CustomerEntity
	): Promise<CreateStatusListResult>;
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result>;
	createEncryptedBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedBitstringOptions,
		customer: CustomerEntity
	): Promise<CreateStatusListResult>;
	updateUnencryptedStatusList(
		did: string,
		listType: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult>;
	updateEncryptedStatusList(
		did: string,
		listType: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult>;
	checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		customer: CustomerEntity
	): Promise<StatusCheckResult>;
	checkBitstringStatusList(
		did: string,
		statusOptions: CheqdCredentialStatus,
		customer: CustomerEntity
	): Promise<BitstringValidationResult>;
	searchStatusList(
		did: string,
		statusListName: string,
		listType: string,
		statusPurpose: 'revocation' | 'suspension',
		customer?: CustomerEntity
	): Promise<SearchStatusListResult>;
	broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		customer: CustomerEntity
	): Promise<boolean>;
	broadcastBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		customer: CustomerEntity
	): Promise<boolean>;
	remunerateStatusList2021(
		feePaymentOptions: FeePaymentOptions,
		customer?: CustomerEntity
	): Promise<TransactionResult>;
	revokeCredentials(
		credential: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<RevocationResult | BulkRevocationResult | BitstringUpdateResult | BulkBitstringUpdateResult>;
	suspendCredentials(
		credential: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<SuspensionResult | BulkSuspensionResult | BitstringUpdateResult | BulkBitstringUpdateResult>;
	reinstateCredentials(
		credential: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<UnsuspensionResult | BulkUnsuspensionResult | BitstringUpdateResult | BulkBitstringUpdateResult>;
	setAPIKey(apiKey: string, customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity>;
	updateAPIKey(apiKey: APIKeyEntity, newApiKey: string): Promise<APIKeyEntity>;
	getAPIKey(customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity | null>;
	decryptAPIKey(apiKey: string): Promise<string>;
	listOperations(options: ListOperationOptions, customer: CustomerEntity): Promise<any>;
}

export class IdentityServiceStrategySetup {
	agent: IIdentityService;
	static unauthorized = new Unauthorized();

	constructor(agentId?: string) {
		this.agent = IdentityServiceStrategySetup.unauthorized;
		this.setupIdentityStrategy(agentId);
	}

	private setStrategy(strategy: IIdentityService) {
		// If is already set up - skip
		if (this.agent === strategy) return;
		this.agent = strategy;
	}

	public setupIdentityStrategy(agentId?: string) {
		if (process.env.ENABLE_EXTERNAL_DB === 'true') {
			if (agentId) {
				this.setStrategy(new PostgresIdentityService());
			}
		} else {
			this.setStrategy(new LocalIdentityService());
		}
	}
}
