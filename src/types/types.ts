import { 
  IDIDManager,
  IKeyManager,
  IDataStore,
  IResolver,
  ICredentialIssuer,
  ICredentialVerifier,
  W3CVerifiableCredential,
  TAgent,
  CredentialStatusReference
} from '@veramo/core'
import { Request } from 'express'
import { ICheqd, ICheqdStatusList2021Options } from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd'
import { ICredentialIssuerLD } from '@veramo/credential-ld'
import { AbstractIdentifierProvider } from '@veramo/did-manager'
import { AbstractKeyManagementSystem } from '@veramo/key-manager'
import { DataSource } from 'typeorm'
import { CheqdDIDProvider } from '@cheqd/did-provider-cheqd'
import { CosmosAccessControlCondition } from '@cheqd/did-provider-cheqd/build/types/dkg-threshold/lit-protocol'
import stringify from 'json-stringify-safe'

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

class MethodToScope {
  private route: string
  private method: string
  private scope: string
  constructor(route: string, method: string, scope: string) {
    this.route = route
    this.method = method
    this.scope = scope
  }
  
  public validate(route: string, method: string, scope: string, namespace="testnet"): boolean {
    return this.route === route && this.method === method && this.scope === scope && this.scope.includes(namespace)
  }

  public isRule(route: string, method: string, namespace="testnet"): boolean {
    return this.route === route && this.method === method && this.scope.includes(namespace)
  }

  public getScope(): string {
    return this.scope
  }
}

export class ApiGuarding {
  private routeToScoupe: MethodToScope[] = []
  private static pathSkip = ['/', '/swagger', '/user', '/static/custom_button.js']
  private static regExpSkip = new RegExp("^/.*js")
  constructor() {
    this.registerRoute('/account', 'GET', 'account:read:testnet')
    this.registerRoute('/account', 'GET', 'account:read:mainnet')
    this.registerRoute('/account', 'POST', 'account:create:testnet')
    this.registerRoute('/account', 'POST', 'account:create:mainnet')
    this.registerRoute('/key', 'POST', 'key:create:testnet')
    this.registerRoute('/key', 'POST', 'key:create:mainnet')
    this.registerRoute('/key', 'GET', 'key:read:testnet')
    this.registerRoute('/key', 'GET', 'key:read:mainnet')
    this.registerRoute('/credential/issue', 'POST', 'credential:issue:testnet')
    this.registerRoute('/credential/issue', 'POST', 'credential:issue:mainnet')
    this.registerRoute('/credential/verify', 'POST', 'credential:verify:testnet')
    this.registerRoute('/credential/verify', 'POST', 'credential:verify:mainnet')
    this.registerRoute('/did/create', 'POST', 'did:create:testnet')
    this.registerRoute('/did/create', 'POST', 'did:create:mainnet')
  }

  private registerRoute(route: string, method: string, scope: string): void {
    this.routeToScoupe.push(new MethodToScope(route, method, scope))
  }

  private findRule(route: string, method: string, namespace="testnet"): MethodToScope | null {
    for (const item of this.routeToScoupe) {
      if (item.isRule(route, method, namespace)) {
        return item
      }
    }
    return null
  }

  public getScopeForRoute(route: string, method: string, namespace: string): string | null {
    const rule = this.findRule(route, method, namespace)
    if (rule) {
      return rule.getScope()
    }
    return null
  }

  public isValidScope(route: string, method: string, scope: string, namespace="testnet"): boolean {
    const rule = this.findRule(route, method, namespace)
    if (rule) {
      return rule.validate(route, method, scope, namespace)
    }
    // If no rule for route, then allow
    return true
  }

  public areValidScopes(route: string, method: string, scopes: string[], namespace="testnet"): boolean {
    for (const scope of scopes) {
      if (this.isValidScope(route, method, scope, namespace)) {
        return true
      }
    }
    return false
  }

  public skipPath(path: string): boolean {
    return ApiGuarding.pathSkip.includes(path) || path.match(ApiGuarding.regExpSkip) !== null
  }

  public getNamespaceFromRequest(req: Request): string {
    const matches = stringify(req.body).match(cheqdDidRegex)
    if (matches && matches.length > 0) {
      return matches[1]
    }
    return 'testnet'
  }
}

export const apiGuarding = new ApiGuarding()
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

export type CreateStatusListOptions = {
  length?: number | undefined,
  encoding?: 'base64' | 'base64url' | 'hex' | undefined
}

export type StatusOptions = {
  statusPurpose: 'revocation' | 'suspension'
  statusListName: string
  statusListIndex?: number
  statusListVersion?: string
  statusListRangeStart?: number
  statusListRangeEnd?: number
  indexNotIn?: number[]
}

export type RevocationStatusOptions = StatusOptions & { statusPurpose: 'revocation' }
export type SuspensionStatusOptions = StatusOptions & { statusPurpose: 'suspension' }

export type VerifyStatusOptions = {
  fetchList?: boolean
  encryptedSymmetricKey?: string
  options?: ICheqdStatusList2021Options
  decryptionOptions: {
    unifiedAccessControlConditions: CosmosAccessControlCondition[]
  }
  bootstrapOptions: {}
}

export interface ResourceMetadata {
  collectionId: string
  resourceId: string
  resourceName: string
  resourceVersion: string
  resourceType: string
  mediaType: string
  created:
    | Date
    | undefined;
  checksum: string;
  previousVersionId: string;
  nextVersionId: string;
}