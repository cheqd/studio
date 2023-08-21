/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	CredentialPayload,
	DIDDocument,
	DIDResolutionResult,
	IIdentifier,
	IVerifyResult,
	ManagedKeyInfo,
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
	StatusOptions,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
	VeramoAgent,
	VerificationOptions,
} from '../../types/shared';
import type { IIdentityService } from './index.js';

export abstract class AbstractIdentityService implements IIdentityService {
	agent?: VeramoAgent;

	initAgent(): VeramoAgent {
		throw new Error(`Not supported`);
	}

	createKey(type: 'Ed25519' | 'Secp256k1', agentId?: string): Promise<ManagedKeyInfo> {
		throw new Error(`Not supported`);
	}

	createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> {
		throw new Error(`Not supported`);
	}

	updateDid(didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> {
		throw new Error(`Not supported`);
	}

	deactivateDid(did: string, agentId?: string): Promise<boolean> {
		throw new Error(`Not supported`);
	}

	importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId: string): Promise<IIdentifier> {
		throw new Error(`Not supported`);
	}

	createResource(network: string, payload: ResourcePayload, agentId?: string): Promise<any> {
		throw new Error(`Not supported`);
	}

	createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		agentId?: string
	): Promise<VerifiableCredential> {
		throw new Error(`Not supported`);
	}
	createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions,
		agentId: string
	): Promise<CreateStatusList2021Result> {
		throw new Error(`Not supported`);
	}
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		agentId: string
	): Promise<CreateStatusList2021Result> {
		throw new Error(`Not supported`);
	}
	updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		agentId?: string
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`);
	}
	updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		agentId?: string
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`);
	}
	checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		agentId?: string
	): Promise<StatusCheckResult> {
		throw new Error(`Not supported`);
	}
	searchStatusList2021(
		did: string,
		statusListName: string,
		statusPurpose: 'revocation' | 'suspension',
		agentId?: string
	): Promise<any> {
		throw new Error(`Not supported`);
	}
	remunerateStatusList2021(feePaymentOptions: FeePaymentOptions): Promise<TransactionResult> {
		throw new Error(`Not supported`);
	}
	broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		agentId?: string
	): Promise<boolean> {
		throw new Error(`Not supported`);
	}
	revokeCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId?: string
	): Promise<RevocationResult | BulkRevocationResult> {
		throw new Error(`Not supported`);
	}
	suspendCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId?: string
	): Promise<SuspensionResult | BulkSuspensionResult> {
		throw new Error(`Not supported`);
	}
	reinstateCredentials(
		credential: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId?: string
	): Promise<UnsuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`);
	}
	getKey(kid: string, agentId: string): Promise<ManagedKeyInfo> {
		throw new Error(`Not supported`);
	}
	listDids(agentId: string): Promise<string[]> {
		throw new Error(`Not supported`);
	}
	getDid(did: string): Promise<any> {
		throw new Error(`Not supported`);
	}
	resolveDid(did: string, agentId?: string): Promise<DIDResolutionResult> {
		throw new Error(`Not supported`);
	}
	resolve(didUrl: string): Promise<Response> {
		throw new Error(`Not supported`);
	}
	verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		agentId?: string
	): Promise<IVerifyResult> {
		throw new Error(`Not supported`);
	}
	verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		agentId?: string
	): Promise<IVerifyResult> {
		throw new Error(`Not supported`);
	}
}
