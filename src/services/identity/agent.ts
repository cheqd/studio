import {
  createAgent,
  CredentialPayload,
  DIDDocument,
  IAgentPlugin,
  IDIDManager,
  IIdentifier,
  IKeyManager,
  IResolver,
  IVerifyResult,
  ManagedKeyInfo,
  MinimalImportableIdentifier,
  MinimalImportableKey,
  TAgent,
  VerifiableCredential,
  VerifiablePresentation,
} from '@veramo/core'

import { Cheqd, getResolver as CheqdDidResolver, ResourcePayload } from '@cheqd/did-provider-cheqd'
import { CheqdNetwork } from '@cheqd/sdk'

import { cheqdDidRegex, CreateAgentRequest, CredentialRequest, VeramoAgent } from '../../types/types.js'
import { VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS } from '../../types/constants.js'
import { KeyManager } from '@veramo/key-manager'
import { DIDStore, KeyStore } from '@veramo/data-store'
import { DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'

export class Veramo {

  static instance = new Veramo()

  public createVeramoAgent({ providers, kms, dbConnection, cheqdProviders, enableResolver, enableCredential }: CreateAgentRequest) : VeramoAgent {
    const plugins: IAgentPlugin[] = []

    if(providers) {
        plugins.push(new DIDManager({
            store: new DIDStore(dbConnection),
            defaultProvider: 'did:cheqd:testnet',
            providers
        }))
    }

    if(kms) {
        plugins.push(new KeyManager({
            store: new KeyStore(dbConnection),
            kms
        }))
    }

    if(cheqdProviders) {
        plugins.push(new Cheqd({
            providers: cheqdProviders
        }))
    }

    if (enableResolver) {
        plugins.push(
          new DIDResolverPlugin({
            resolver: new Resolver({
              ...CheqdDidResolver({ url: process.env.RESOLVER_URL }) as ResolverRegistry
            })
          })
        )
    }

    if (enableCredential) {
        plugins.push(
            new CredentialPlugin(),
            new CredentialIssuerLD({
            contextMaps: [LdDefaultContexts],
            suites: [new VeramoEd25519Signature2018()]
            })
        )
    }
    return createAgent({ plugins })
  }

  async createKey(agent: TAgent<IKeyManager>, type: 'Ed25519' | 'Secp256k1'='Ed25519'): Promise<ManagedKeyInfo> {
    const [kms] = await agent.keyManagerGetKeyManagementSystems()
    const key = await agent.keyManagerCreate({
      type: type || 'Ed25519',
      kms,
    })
    return key
  }

  async getKey(agent: TAgent<IKeyManager>, kid: string) {
    return await agent.keyManagerGet({ kid })
  }

  async createDid(agent: TAgent<IDIDManager>, network: string, didDocument: DIDDocument): Promise<IIdentifier> {
    try {
      const [kms] = await agent.keyManagerGetKeyManagementSystems()

      const identifier: IIdentifier = await agent.didManagerCreate({
        provider: `did:cheqd:${network}`,
        kms,
        options: {
          document: didDocument
        }
      })
      return identifier
    } catch (error) {
      throw new Error(`${error}`)
    }
  }

  async listDids(agent: TAgent<IDIDManager>) {
    return (await agent.didManagerFind()).map((res)=>res.did)
  }

  async resolveDid(agent: TAgent<IResolver>, did: string) {
    return await agent.resolveDid({ didUrl: did })
  }

  async getDid(agent: TAgent<IDIDManager>, did: string) {
    return await agent.didManagerGet({ did })
  }

  async importDid(agent: TAgent<IDIDManager>, did: string, privateKeyHex: string, publicKeyHex: string): Promise<IIdentifier> {
    const [kms] = await agent.keyManagerGetKeyManagementSystems()

    if (!did.match(cheqdDidRegex)) {
      throw new Error('Invalid DID')
    }

    const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', privateKeyHex, publicKeyHex }
    const identifier: IIdentifier = await agent.didManagerImport({ keys: [key], did, controllerKeyId: key.kid } as MinimalImportableIdentifier)
    return identifier
  }

  async createResource(agent: VeramoAgent, network: string, payload: ResourcePayload) {
    try {
        const [kms] = await agent.keyManagerGetKeyManagementSystems()

        const result: boolean = await agent.cheqdCreateLinkedResource({
            kms,
            payload,
            network: network as CheqdNetwork
        })
        return result
    } catch (error) {
        throw new Error(`${error}`)
    }    
  }

  async createCredential(agent: VeramoAgent, credential: CredentialPayload, format: CredentialRequest['format']): Promise<VerifiableCredential> {
    try {
        const verifiable_credential = await agent.createVerifiableCredential(
            {
                save: false,
                credential,
                proofFormat: format == 'jsonld' ? 'lds' : VC_PROOF_FORMAT,
                removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS
            }
        )
        return verifiable_credential
    } catch (error) {
        throw new Error(`${error}`)
    }          
  }

  async verifyCredential(agent: VeramoAgent, credential: string | VerifiableCredential): Promise<IVerifyResult> {
    return await agent.verifyCredential({ credential, fetchRemoteContexts: true })
  }

  async verifyPresentation(agent: VeramoAgent, presentation: VerifiablePresentation | string): Promise<IVerifyResult> {
    return await agent.verifyPresentation({ presentation, fetchRemoteContexts: true })
  }
}
