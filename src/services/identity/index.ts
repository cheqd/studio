import * as dotenv from 'dotenv';
import { LocalIdentity } from './local.js';
import { PostgresIdentity } from './postgres.js';
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
import type { AbstractPrivateKeyStore } from '@veramo/key-manager';
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
} from '@cheqd/did-provider-cheqd';
import type {
	BroadcastStatusListOptions,
	CheckStatusListOptions,
	CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions,
	CredentialRequest,
	StatusOptions,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
	VeramoAgent,
	VerificationOptions,
} from '../../types/shared';

dotenv.config();

export interface IIdentity {
	agent?: TAgent<any>;
	privateStore?: AbstractPrivateKeyStore;
	initAgent(): TAgent<any>;
	createAgent?(agentId: string): Promise<VeramoAgent>;
	createKey(type: 'Ed25519' | 'Secp256k1', agentId?: string): Promise<ManagedKeyInfo>;
	getKey(kid: string, agentId?: string): Promise<ManagedKeyInfo>;
	createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier>;
	updateDid(didDocument: DIDDocument, agentId?: string): Promise<IIdentifier>;
	deactivateDid(did: string, agentId?: string): Promise<boolean>;
	listDids(agentId?: string): Promise<string[]>;
	resolveDid(did: string): Promise<DIDResolutionResult>;
	getDid(did: string, agentId?: string): Promise<any>;
	importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId?: string): Promise<IIdentifier>;
	createResource(network: string, payload: ResourcePayload, agentId?: string): Promise<any>;
	createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		agentId?: string
	): Promise<VerifiableCredential>;
	verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		agentId?: string
	): Promise<IVerifyResult>;
	verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		agentId?: string
	): Promise<IVerifyResult>;
	createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions,
		agentId: string
	): Promise<CreateStatusList2021Result>;
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		agentId: string
	): Promise<CreateStatusList2021Result>;
	updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		agentId?: string
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult>;
	updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		agentId?: string
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult>;
	broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		agentId?: string
	): Promise<boolean>;
	checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		agentId?: string
	): Promise<StatusCheckResult>;
	revokeCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId?: string
	): Promise<RevocationResult | BulkRevocationResult>;
	suspendCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId?: string
	): Promise<SuspensionResult | BulkSuspensionResult>;
	reinstateCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId?: string
	): Promise<UnsuspensionResult | BulkUnsuspensionResult>;
}

export class Identity {
	agent: IIdentity;
	static unauthorized = new Unauthorized();

	constructor(agentId?: string) {
		this.agent = Identity.unauthorized;
		this.setupIdentityStrategy(agentId);
	}

	private setStrategy(strategy: IIdentity) {
		// If is already set up - skip
		if (this.agent === strategy) return;
		this.agent = strategy;
	}

	public setupIdentityStrategy(agentId?: string) {
		if (process.env.ENABLE_EXTERNAL_DB === 'true') {
			if (agentId) {
				this.setStrategy(new PostgresIdentity());
			}
		} else {
			this.setStrategy(new LocalIdentity());
		}
	}
}
