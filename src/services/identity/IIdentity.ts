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
} from '@veramo/core'
import type { AbstractPrivateKeyStore } from '@veramo/key-manager'
import type { ResourcePayload } from '@cheqd/did-provider-cheqd'
import type { BulkRevocationResult, BulkSuspensionResult, BulkUnsuspensionResult, CreateStatusList2021Result, RevocationResult, StatusCheckResult, SuspensionResult, UnsuspensionResult } from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd'
import type { BroadCastStatusListOptions, CheckStatusListOptions, CreateStatusListOptions, CredentialRequest, StatusOptions, UpdateStatusListOptions, VeramoAgent, VerifyCredentialStatusOptions, VerifyPresentationStatusOptions } from '../../types/types'

export interface IIdentity {
  agent?: TAgent<any>
  privateStore?: AbstractPrivateKeyStore
  initAgent(): TAgent<any>
  createAgent?(agentId: string): Promise<VeramoAgent>
  createKey(type: 'Ed25519' | 'Secp256k1', agentId?: string): Promise<ManagedKeyInfo>
  getKey(kid: string, agentId?: string): Promise<ManagedKeyInfo>
  createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> 
  updateDid(didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> 
  deactivateDid(did: string, agentId?: string): Promise<boolean> 
  listDids(agentId?: string): Promise<string[]>
  resolveDid(did: string): Promise<DIDResolutionResult>
  getDid(did: string, agentId?: string): Promise<any>
  importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId?: string): Promise<IIdentifier> 
  createResource(network: string, payload: ResourcePayload, agentId?: string): Promise<any>
  createCredential(credential: CredentialPayload, format: CredentialRequest['format'], statusOptions: StatusOptions | null, agentId?: string): Promise<VerifiableCredential>
  verifyCredential(credential: VerifiableCredential | string, statusOptions: VerifyCredentialStatusOptions | null, agentId?: string): Promise<IVerifyResult>
  verifyPresentation(presentation: VerifiablePresentation | string, statusOptions: VerifyPresentationStatusOptions, agentId?: string): Promise<IVerifyResult>
  createStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: CreateStatusListOptions, agentId: string): Promise<CreateStatusList2021Result>
  updateStatusList2021(did: string, statusOptions: UpdateStatusListOptions, publish?: boolean, agentId?: string): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult>
  broadcastStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: BroadCastStatusListOptions, agentId?: string): Promise<boolean>
  checkStatusList2021(did: string, statusOptions: CheckStatusListOptions, agentId?: string): Promise<StatusCheckResult>
  revokeCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<RevocationResult| BulkRevocationResult>
  suspendCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<SuspensionResult| BulkSuspensionResult>
  reinstateCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<UnsuspensionResult| BulkUnsuspensionResult> 
}
