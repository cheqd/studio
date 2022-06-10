export type ErrorResponse  = {
    name: string
    message: string
    stack?: string
    status: number
}

export type CompactJWT = string

export type IssuerType = { id: string; [x: string]: any } | string

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

export type W3CVerifiableCredential = VerifiableCredential | CompactJWT

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
    issuer: IssuerType
    credentialSubject?: CredentialSubject
    type?: string[]
    '@context'?: string[]
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

export type CredentialRequest = Request & { credential?: W3CVerifiableCredential }

export type GenericAuthResponse = {
    authenticated: boolean
    user: GenericAuthUser
}

export type GenericAuthUser = Record<string, any> | null | undefined
