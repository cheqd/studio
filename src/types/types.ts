import { 
  IDIDManager,
  IKeyManager,
  IDataStore,
  IResolver,
  ICredentialIssuer,
  ICredentialVerifier,
  W3CVerifiableCredential,
  TAgent
} from '@veramo/core'
import { ICheqd, ICheqdCheckCredentialWithStatusList2021StatusOptions, ICheqdStatusList2021Options } from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd'
import { ICredentialIssuerLD } from '@veramo/credential-ld'
import { AbstractIdentifierProvider } from '@veramo/did-manager'
import { AbstractKeyManagementSystem } from '@veramo/key-manager'
import { DataSource } from 'typeorm'
import { CheqdDIDProvider } from '@cheqd/did-provider-cheqd'
import { CosmosAccessControlCondition } from '@cheqd/did-provider-cheqd/build/types/dkg-threshold/lit-protocol'

export type ErrorResponse = {
  name: string
  message: string
  stack?: string
  status: number
}

export interface IHash {
  [details: string] : string
} 

export type CompactJWT = string

export type DateType = string | Date

export interface PresentationPayload {
  holder: string
  verifiableCredential?: W3CVerifiableCredential[]
  type?: string[]
  '@context'?: string[]
  verifier?: string[]
  issuanceDate?: DateType
  expirationDate?: DateType
  id?: string

  [x: string]: any
}

export type GenericAuthResponse = {
  authenticated: boolean
  user: GenericAuthUser,
  provider: string,
  error?: any
}

export interface CredentialRequest {
  subjectDid: string
  attributes: Record<string, any>
  '@context'?: string[]
  type?: string[]
  expirationDate?: DateType
  issuerDid: string
  format: 'jsonld' | 'jwt'
  credentialStatus?: StatusOptions
  credentialSchema?: string
  credentialName?: string
  credentialSummary?: string
}

export type GenericAuthUser = Record<string, any> | null | undefined

const UUID = '([a-z,0-9,-]{36,36})'
const ID_CHAR = `(?:[a-zA-Z0-9]{21,22}|${UUID})`
const NETWORK = '(testnet|mainnet)'
const METHOD_ID = `((?:${ID_CHAR}*:)*(${ID_CHAR}+))`
export const cheqdDidRegex = new RegExp(`^did:cheqd:${NETWORK}:${METHOD_ID}$`)

export enum DefaultRPCUrl {
  Mainnet = 'https://rpc.cheqd.net',
  Testnet = 'https://rpc.cheqd.network'
}

export enum NetworkType {
  Mainnet = 'mainnet',
  Testnet = 'testnet'
}

export enum DefaultResolverUrl {
  Cheqd = 'https://resolver.cheqd.net/'
}

export type SpecValidationResult = {
  valid: boolean
  error?: string
}


export type VeramoAgent = TAgent<IDIDManager & 
IKeyManager & 
IDataStore & 
IResolver & 
ICredentialIssuer & 
ICredentialVerifier & 
ICheqd & 
ICredentialIssuerLD>

export type CreateAgentRequest = { 
  providers?: Record<string, AbstractIdentifierProvider>,
  kms?: Record<string, AbstractKeyManagementSystem>,
  dbConnection: DataSource,
  cheqdProviders?: CheqdDIDProvider[],
  enableResolver?: boolean,
  enableCredential?: boolean
}

export const StatusList2021ResourceTypes = {
  revocation: 'StatusList2021Revocation',
  suspension: 'StatusList2021Suspension'
}

export type CreateStatusListOptions = {
  length?: number | undefined,
  encoding?: 'base64' | 'base64url' | 'hex' | undefined
  statusPurpose: 'revocation' | 'suspension'
  encrypted?: boolean
}

export type BroadCastStatusListOptions = Omit<CreateStatusListOptions, 'length'>

export type StatusOptions = {
  statusPurpose: CreateStatusListOptions['statusPurpose']
  statusListName: string
  statusListIndex?: number
  statusListVersion?: string
  statusListRangeStart?: number
  statusListRangeEnd?: number
  indexNotIn?: number[]
}

export type RevocationStatusOptions = StatusOptions & { statusPurpose: 'revocation' }
export type SuspensionStatusOptions = StatusOptions & { statusPurpose: 'suspension' }

export type VerifyCredentialStatusOptions = {
  fetchList?: boolean
  encryptedSymmetricKey?: string
  options?: ICheqdStatusList2021Options
}

export type VerifyPresentationStatusOptions = Omit<VerifyCredentialStatusOptions, 'decryptionOptions'>

export interface ResourceMetadata {
  collectionId: string
  resourceId: string
  resourceName: string
  resourceVersion: string
  resourceType: string
  mediaType: string
  created:
    | Date
    | undefined
  checksum: string
  previousVersionId: string
  nextVersionId: string
}

export interface UpdateStatusListOptions {
  indices: number[]
  statusListName: string
  statusListVersion?: string
  statusAction: 'revoke' | 'suspend' | 'reinstate'   
}

export type CheckStatusListOptions = Omit<ICheqdCheckCredentialWithStatusList2021StatusOptions, 'issuerDid'>