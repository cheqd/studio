import {
    createAgent,
    IDIDManager,
    IResolver,
    IDataStore,
    IKeyManager,
    TAgent,
} from '@veramo/core'
import { DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { KeyManager, MemoryKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { CredentialIssuer } from '@veramo/credential-w3c'
//import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'

import { CheqdDIDProvider, getResolver as CheqdDidResolver } from '@cheqd/did-provider-cheqd'

import { VC_CONTEXT, VC_TYPE, HEADERS, VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS } from '../constants'
import { CredentialPayload, CredentialRequest, CredentialSubject, VerifiableCredential } from '../types'

import { Identity } from './identity'

export class Credentials {

    agent: TAgent<any> | null | undefined

    constructor(agent?: TAgent<any>) {
        this.agent = agent
        if( !agent ) this.init_agent()
    }

    init_agent(): void {
        this.agent = createAgent<IDIDManager & IKeyManager & IDataStore & IResolver>({
            plugins: [
                new KeyManager({
                    store: new MemoryKeyStore(),
                    kms: {
                        local: new KeyManagementSystem(
                            new MemoryPrivateKeyStore()
                        )
                    }
                }),
                new DIDManager({
                    store: new MemoryDIDStore(),
                    defaultProvider: 'did:cheqd:mainnet',
                    providers: {
                        'did:cheqd:mainnet': new CheqdDIDProvider(
                            {
                                defaultKms: 'local'
                            }
                        )
                    }
                }),
                new DIDResolverPlugin({
                    resolver: new Resolver({
                        ...CheqdDidResolver() as ResolverRegistry
                    })
                }),
                new CredentialIssuer(),
            ]
        })
    }

    async issue_credentials(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const public_key = url.pathname.split('/').pop() || "";

        if( !this.agent ) throw new Error('No initialised agent found.')

        const identity_handler = new Identity(
            this.agent,
            'demo'
        )

        const issuer_id = await identity_handler.load_issuer_did(
            request,
            this.agent
        )

        this.agent = identity_handler.agent!

        const credential_subject: CredentialSubject = {
            id: `did:key:${public_key}`,
            type: undefined
        }

        const credential: CredentialPayload = {
            issuer: { id: issuer_id.did },
            '@context': VC_CONTEXT,
            type: [ VC_TYPE ],
            issuanceDate: new Date().toISOString(),
            credentialSubject: credential_subject,
            name: "I got this credential at #IIW 34 in April 2022"
        }

        const verifiable_credential: Omit<VerifiableCredential, 'vc'> = await this.agent.execute(
            'createVerifiableCredential',
            {
                save: false,
                credential,
                proofFormat: VC_PROOF_FORMAT,
                removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS
            }
        )

        if( verifiable_credential?.vc ) delete verifiable_credential.vc
        if( verifiable_credential?.sub ) delete verifiable_credential.sub
        if( verifiable_credential?.iss ) delete verifiable_credential.iss
        if( verifiable_credential?.nbf ) delete verifiable_credential.nbf
        if( verifiable_credential?.exp ) delete verifiable_credential.exp

        return new Response(
            JSON.stringify(
                verifiable_credential,
                null,
                2
            ),
            {
                headers: {
                    ...HEADERS.json
                }
            }
        )
    }

    async verify_credentials(request: CredentialRequest): Promise<Response> {
        if( !request.headers.get('Content-Type') || request.headers.get('Content-Type') != 'application/json' ) return new Response( JSON.stringify( { error: 'Unsupported media type.' } ), { status: 405, headers: HEADERS.json } )

        const credential = request?.credential

        if( !credential ) return new Response( JSON.stringify( { error: 'W3C Verifiable credential is not provided.' } ), { status: 400, headers: HEADERS.json } )

        const verified = await this.agent?.execute(
            'verifyCredential',
            {
                credential: credential
            }
        )

        return new Response(
            JSON.stringify(
                {
                    verified: verified
                }
            ),
            {
                headers: {
                    ...HEADERS.json
                }
            }
        )
    }
}