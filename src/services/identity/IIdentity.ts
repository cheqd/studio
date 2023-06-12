import {
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
import { AbstractPrivateKeyStore } from '@veramo/key-manager'
import { ResourcePayload } from '@cheqd/did-provider-cheqd'

import { CreateStatusListOptions, CredentialRequest, StatusOptions, VeramoAgent, VerifyStatusOptions } from '../../types/types'

import * as dotenv from 'dotenv'
import { RevocationResult } from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd'
dotenv.config()

export interface IIdentity {
  agent?: TAgent<any>
  privateStore?: AbstractPrivateKeyStore
  initAgent(): TAgent<any>
  createAgent?(agentId: string): Promise<VeramoAgent>
  createKey(type: 'Ed25519' | 'Secp256k1', agentId?: string): Promise<ManagedKeyInfo>
  getKey(kid: string, agentId?: string): Promise<ManagedKeyInfo>
  createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> 
  listDids(agentId?: string): Promise<string[]>
  resolveDid(did: string): Promise<DIDResolutionResult>
  getDid(did: string, agentId?: string): Promise<any>
  importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId?: string): Promise<IIdentifier> 
  createResource(network: string, payload: ResourcePayload, agentId?: string): Promise<any>
  createCredential(credential: CredentialPayload, format: CredentialRequest['format'], statusListOptions: StatusOptions | null, agentId?: string): Promise<VerifiableCredential>
  verifyCredential(credential: VerifiableCredential | string, statusOptions: VerifyStatusOptions | null, agentId?: string): Promise<IVerifyResult>
  verifyPresentation(presentation: VerifiablePresentation | string, agentId?: string): Promise<IVerifyResult>
  createStatusList2021(did: string, network: string, resourceOptions: ResourcePayload, statusOptions: CreateStatusListOptions, agentId: string): Promise<boolean>
  revokeCredentials(credential: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId?: string): Promise<RevocationResult| RevocationResult[]>
}
