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
import * as dotenv from 'dotenv'
import { CredentialRequest, VeramoAgent } from '../../types/types'
dotenv.config()

export interface IIdentity {
  agent: TAgent<any>
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
  createCredential(credential: CredentialPayload, format: CredentialRequest['format'], agentId?: string): Promise<VerifiableCredential>
  verifyCredential(credential: VerifiableCredential | string, agentId?: string): Promise<IVerifyResult>
  verifyPresentation(presentation: VerifiablePresentation | string, agentId?: string): Promise<IVerifyResult>
}
