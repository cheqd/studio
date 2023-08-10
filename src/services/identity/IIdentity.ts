import type {
	CredentialPayload, DIDDocument, DIDResolutionResult, IIdentifier, IVerifyResult,
	ManagedKeyInfo, TAgent, VerifiableCredential, VerifiablePresentation,
} from '@veramo/core'
import type { AbstractPrivateKeyStore } from '@veramo/key-manager'
import type { ResourcePayload } from '@cheqd/did-provider-cheqd'
import type {
	BulkRevocationResult, BulkSuspensionResult, BulkUnsuspensionResult, CreateStatusList2021Result,
	RevocationResult, StatusCheckResult, SuspensionResult, UnsuspensionResult,
} from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd'
import type {
	BroadCastStatusListOptions, CheckStatusListOptions, CreateStatusListOptions, CredentialRequest,
	StatusOptions, UpdateStatusListOptions, VeramoAgent, VerificationOptions,
} from '../../types/types'

export interface IIdentity {
	initAgent(): TAgent<any>
	createAgent?(agentId: string): Promise<VeramoAgent>
	createKey(type: 'Ed25519' | 'Secp256k1', agentId?: string): Promise<ManagedKeyInfo>
	getKey(kid: string, agentId?: string): Promise<ManagedKeyInfo>
	createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier>
	updateDid(didDocument: DIDDocument, agentId?: string): Promise<IIdentifier>
	deactivateDid(did: string, agentId?: string): Promise<boolean>
	listDids(agentId?: string): Promise<string[]>
	resolveDid(didUrl: string): Promise<DIDResolutionResult>
	getDid(did: string, agentId?: string): Promise<any>
	importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId?: string): Promise<IIdentifier>
	createResource(network: string, payload: ResourcePayload, agentId?: string): Promise<any>
	resourceList(did: string): Promise<any>
	getResource(did: string, resourceId: string): Promise<[string, string]>
	createCredential(credential: CredentialPayload, format: CredentialRequest['format'], statusOptions: StatusOptions | null, agentId?: string): Promise<VerifiableCredential>
	verifyCredential(credential: VerifiableCredential | string, verificationOptions: VerificationOptions, agentId?: string): Promise<IVerifyResult>
	verifyPresentation(presentation: VerifiablePresentation | string, verificationOptions: VerificationOptions, agentId?: string): Promise<IVerifyResult>
	createStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: CreateStatusListOptions, agentId: string): Promise<CreateStatusList2021Result>
	updateStatusList2021(did: string, statusOptions: UpdateStatusListOptions, publish?: boolean, agentId?: string): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult>
	broadcastStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: BroadCastStatusListOptions, agentId?: string): Promise<boolean>
	checkStatusList2021(did: string, statusOptions: CheckStatusListOptions, agentId?: string): Promise<StatusCheckResult>
	searchStatusList2021(did: string, statusListName: string, statusPurpose: 'revocation' | 'suspension', agentId?: string): Promise<any>
	revokeCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<RevocationResult | BulkRevocationResult>
	suspendCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<SuspensionResult | BulkSuspensionResult>
	reinstateCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<UnsuspensionResult | BulkUnsuspensionResult>
}

export abstract class AbstractIdentity implements IIdentity {
	agent?: VeramoAgent
	privateStore?: AbstractPrivateKeyStore

	initAgent(): VeramoAgent {
		throw new Error(`Not supported`)
	}

	createKey(type: 'Ed25519' | 'Secp256k1', agentId?: string): Promise<ManagedKeyInfo> {
		throw new Error(`Not supported`)
	}
	createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> {
		throw new Error(`Not supported`)
	}
	updateDid(didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> {
		throw new Error(`Not supported`)
	}
	deactivateDid(did: string, agentId?: string): Promise<boolean> {
		throw new Error(`Not supported`)
	}
	importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId: string): Promise<IIdentifier> {
		throw new Error(`Not supported`)
	}
	createResource(network: string, payload: ResourcePayload, agentId?: string): Promise<any> {
		throw new Error(`Not supported`)
	}
	resourceList(did: string): Promise<any> {
		throw new Error(`Not supported`)
	}
	getResource(did: string, resourceId: string): Promise<[string, string]> {
		throw new Error(`Not supported`)
	}
	createCredential(credential: CredentialPayload, format: CredentialRequest['format'], statusOptions: StatusOptions | null, agentId?: string): Promise<VerifiableCredential> {
		throw new Error(`Not supported`)
	}
	createStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: CreateStatusListOptions, agentId: string): Promise<CreateStatusList2021Result> {
		throw new Error(`Not supported`)
	}
	updateStatusList2021(did: string, statusOptions: UpdateStatusListOptions, publish?: boolean, agentId?: string): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`)
	}
	broadcastStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: BroadCastStatusListOptions, agentId?: string): Promise<boolean> {
		throw new Error(`Not supported`)
	}
	revokeCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<RevocationResult | BulkRevocationResult> {
		throw new Error(`Not supported`)
	}
	suspendCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<SuspensionResult | BulkSuspensionResult> {
		throw new Error(`Not supported`)
	}
	reinstateCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<UnsuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`)
	}
	getKey(kid: string, agentId: string): Promise<ManagedKeyInfo> {
		throw new Error(`Not supported`)
	}
	listDids(agentId: string): Promise<string[]> {
		throw new Error(`Not supported`)
	}
	getDid(did: string): Promise<any> {
		throw new Error(`Not supported`)
	}

	resolveDid(didUrl: string): Promise<DIDResolutionResult> {
		throw new Error(`Not supported`)
	}

	verifyCredential(credential: VerifiableCredential | string, verificationOptions: VerificationOptions, agentId?: string): Promise<IVerifyResult> {
		throw new Error(`Not supported`)
	}

	verifyPresentation(presentation: VerifiablePresentation | string, verificationOptions: VerificationOptions, agentId?: string): Promise<IVerifyResult> {
		throw new Error(`Not supported`)
	}

	checkStatusList2021(did: string, statusOptions: CheckStatusListOptions, agentId?: string): Promise<StatusCheckResult> {
		throw new Error(`Not supported`)
	}

	searchStatusList2021(did: string, statusListName: string, statusPurpose: 'revocation' | 'suspension', agentId?: string): Promise<any> {
		throw new Error(`Not supported`)
	}
}
