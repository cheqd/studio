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
import { ICheqd, ICheqdStatusList2021Options } from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd'
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

class MethodToScope {
  private route: string
  private method: string
  private scope: string
  constructor(route: string, method: string, scope: string) {
    this.route = route
    this.method = method
    this.scope = scope
  }
  
  public validate(route: string, method: string, scope: string): boolean {
    return this.route === route && this.method === method && this.scope === scope
  }

  public isRule(route: string, method: string): boolean {
    return this.route === route && this.method === method
  }

  public getScope(): string {
    return this.scope
  }
}

export class ApiGuarding {
  private routeToScoupe: MethodToScope[] = []
  private static pathSkip = ['/', '/swagger', '/user']
  private static regExpSkip = new RegExp("^/.*js")
  constructor() {
    this.registerRoute('/account', 'GET', 'account:read')
    this.registerRoute('/account', 'POST', 'account:create')
    this.registerRoute('/key', 'POST', 'key:create')
    this.registerRoute('/key', 'GET', 'key:read')
    this.registerRoute('/credential/issue', 'POST', 'credential:issue')
    this.registerRoute('/credential/verify', 'POST', 'credential:verify')
    this.registerRoute('/did/create', 'POST', 'did:create')
  }

  private registerRoute(route: string, method: string, scope: string): void {
    this.routeToScoupe.push(new MethodToScope(route, method, scope))
  }

  private findRule(route: string, method: string): MethodToScope | null {
    for (const item of this.routeToScoupe) {
      if (item.isRule(route, method)) {
        return item
      }
    }
    return null
  }

  public getScopeForRoute(route: string, method: string): string | null {
    const rule = this.findRule(route, method)
    if (rule) {
      return rule.getScope()
    }
    return null
  }

  public isValidScope(route: string, method: string, scope: string): boolean {
    const rule = this.findRule(route, method)
    if (rule) {
      return rule.validate(route, method, scope)
    }
    // If no rule for route, then allow
    return true
  }

  public areValidScopes(route: string, method: string, scopes: string[]): boolean {
    for (const scope of scopes) {
      if (this.isValidScope(route, method, scope)) {
        return true
      }
    }
    return false
  }

  public skipPath(path: string): boolean {
    return ApiGuarding.pathSkip.includes(path) || path.match(ApiGuarding.regExpSkip) !== null
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
