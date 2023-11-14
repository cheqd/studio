/* eslint-disable @typescript-eslint/no-explicit-any */
import * as dotenv from 'dotenv';
import { LocalIdentityService } from './local.js';
import { PostgresIdentityService } from './postgres.js';
import { Unauthorized } from './unauthorized.js';

import type {
	CredentialPayload,
	DIDDocument,
	DIDResolutionResult,
	IIdentifier,
	IVerifyResult,
	ManagedKeyInfo,
	TAgent,
	VerifiableCredential,
	VerifiablePresentation,
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
} from '@cheqd/did-provider-cheqd';
import type {
	BroadcastStatusListOptions,
	CheckStatusListOptions,
	CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions,
	CredentialRequest,
	FeePaymentOptions,
	ITrackOperation,
	SearchStatusListResult,
	StatusOptions,
	TrackResult,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
	VeramoAgent,
	VerificationOptions,
} from '../../types/shared';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../database/entities/key.entity.js';

dotenv.config();

// ToDo: get rid of this interface
// Move it to the abstract factory

export interface IIdentityService {
	agent?: VeramoAgent;

	initAgent(): TAgent<any>;
	createAgent?(customer: CustomerEntity): Promise<VeramoAgent>;
	createKey(type: 'Ed25519' | 'Secp256k1', customer?: CustomerEntity, keyAlias?: string): Promise<KeyEntity>;
	getKey(kid: string, customer?: CustomerEntity): Promise<ManagedKeyInfo | null>;
	createDid(network: string, didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier>;
	updateDid(didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier>;
	deactivateDid(did: string, customer: CustomerEntity): Promise<boolean>;
	listDids(customer: CustomerEntity): Promise<string[]>;
	resolveDid(did: string): Promise<DIDResolutionResult>;
	resolve(didUrl: string): Promise<Response>;
	getDid(did: string, customer: CustomerEntity): Promise<any>;
	importDid(did: string, privateKeyHex: string, publicKeyHex: string, customer: CustomerEntity): Promise<IIdentifier>;
	createResource(network: string, payload: ResourcePayload, customer: CustomerEntity): Promise<any>;
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
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result>;
	trackOperation(trackOperation: ITrackOperation): Promise<TrackResult>;
	updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult>;
	updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult>;
	checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		customer: CustomerEntity
	): Promise<StatusCheckResult>;
	searchStatusList2021(
		did: string,
		statusListName: string,
		statusPurpose: 'revocation' | 'suspension',
		customer?: CustomerEntity
	): Promise<SearchStatusListResult>;
	broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		customer: CustomerEntity
	): Promise<boolean>;
	remunerateStatusList2021(
		feePaymentOptions: FeePaymentOptions,
		customer?: CustomerEntity
	): Promise<TransactionResult>;
	revokeCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<RevocationResult | BulkRevocationResult>;
	suspendCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<SuspensionResult | BulkSuspensionResult>;
	reinstateCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<UnsuspensionResult | BulkUnsuspensionResult>;
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
