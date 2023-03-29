import { ContextType } from "@veramo/core-types"
import { W3CVerifiableCredential } from "@veramo/core"

export type ErrorResponse = {
  name: string
  message: string
  stack?: string
  status: number
}

export type CompactJWT = string

export type IssuerType = { id: string;[x: string]: any } | string

export type CredentialSubject = {
  id?: string
  [x: string]: any
}

export type CredentialStatus = {
  id?: string
  type?: string
  [x: string]: any
}


export interface ProofType {
  type?: string

  [x: string]: any
}

export interface UnsignedCredential {
  issuer: IssuerType
  credentialSubject: CredentialSubject
  type?: string[] | string
  '@context': string[] | string
  issuanceDate: string
  expirationDate?: string
  credentialStatus?: CredentialStatus
  id?: string

  [x: string]: any
}

export type VerifiableCredential = UnsignedCredential & { proof: ProofType }

export interface UnsignedPresentation {
  holder: string
  verifiableCredential?: W3CVerifiableCredential[]
  type?: string[] | string
  '@context': string[] | string
  verifier?: string[]
  issuanceDate?: string
  expirationDate?: string
  id?: string

  [x: string]: any
}

export type VerifiablePresentation = UnsignedPresentation & { proof: ProofType }

export type W3CVerifiablePresentation = VerifiablePresentation | CompactJWT

export type DateType = string | Date

export interface CredentialPayload {
  issuer?: IssuerType
  credentialSubject?: CredentialSubject
  type?: string[]
  '@context'?: ContextType
  issuanceDate?: DateType
  expirationDate?: DateType
  credentialStatus?: CredentialStatus
  id?: string

  [x: string]: any
}

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
  subjectId?: string,
  error?: any
}

export type WebPage = {
  '@type': string,
  description?: string,
  name?: string
  identifier?: string
  URL?: string
  lastReviewed?: Date
  thumbnailUrl?: string
}

export interface CredentialRequest {
  subjectDid: string
  attributes: Record<string, any>
  '@context'?: string[]
  type?: string[]
  expirationDate?: DateType
}

export type GenericAuthUser = Record<string, any> | null | undefined

export type Credential = Omit<VerifiableCredential, "vc">

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
  Mainnet = "mainnet",
  Testnet = "testnet"
}

export enum DefaultResolverUrl {
  Cheqd = "https://resolver.cheqd.net"
}