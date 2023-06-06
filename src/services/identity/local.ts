import {
  DIDDocument,
  IIdentifier,
  ManagedKeyInfo,
  MinimalImportableIdentifier,
  MinimalImportableKey,
  TAgent,
  createAgent,
  CredentialPayload,
  VerifiableCredential,
  IVerifyResult,
  VerifiablePresentation,
} from '@veramo/core'
import { DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { AbstractPrivateKeyStore, KeyManager, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'
import { KeyStore, DIDStore } from '@veramo/data-store'
import { Cheqd, CheqdDIDProvider, getResolver as CheqdDidResolver, ResourcePayload } from '@cheqd/did-provider-cheqd'
import { CheqdNetwork } from '@cheqd/sdk'
import { Resolver, ResolverRegistry } from 'did-resolver'

import { cheqdDidRegex, CredentialRequest, DefaultRPCUrl, VeramoAgent } from '../../types/types.js'
import * as dotenv from 'dotenv'
import { Connection } from '../../database/connection/connection.js'
import { IIdentity } from './IIdentity.js'
import { VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS } from '../../types/constants.js'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'
dotenv.config()

const {
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
  RESOLVER_URL,
  FEE_PAYER_MNEMONIC,
  ISSUER_ID_PUBLIC_KEY_HEX,
  ISSUER_ID_PRIVATE_KEY_HEX,
  ISSUER_DID
} = process.env

export class LocalIdentity implements IIdentity {
  agent: VeramoAgent
  privateStore?: AbstractPrivateKeyStore
  public static instance = new LocalIdentity()

  constructor() {
    this.agent = this.initAgent()
    if (!FEE_PAYER_MNEMONIC) {
        throw new Error(`No fee payer found`)
    }
  }

  initAgent() {
    const dbConnection = Connection.instance.dbConnection
    this.privateStore = new MemoryPrivateKeyStore()

    const mainnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: FEE_PAYER_MNEMONIC,
        networkType: CheqdNetwork.Mainnet as any,
        rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
      }
    )
    const testnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: FEE_PAYER_MNEMONIC,
        networkType: CheqdNetwork.Testnet as any,
        rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
      }
    )
    return createAgent<TAgent<VeramoAgent>>({
      plugins: [
        new KeyManager({
          store: new KeyStore(dbConnection),
          kms: {
            local: new KeyManagementSystem(
              this.privateStore
            )
          }
        }),
        new DIDManager({
          store: new DIDStore(dbConnection),
          defaultProvider: 'did:cheqd:testnet',
          providers: {
            'did:cheqd:mainnet': mainnetProvider,
            'did:cheqd:testnet': testnetProvider
          }
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...CheqdDidResolver({ url: RESOLVER_URL }) as ResolverRegistry
          })
        }),
        new CredentialPlugin(),
        new CredentialIssuerLD({
          contextMaps: [LdDefaultContexts],
          suites: [new VeramoEd25519Signature2018()]
        }),
        new Cheqd({
            providers: [mainnetProvider, testnetProvider]
        })
      ]
    })
  }

  async createKey(): Promise<ManagedKeyInfo> {
    throw new Error('Not supported')
  }

  async getKey(kid: string) {
    return await this.agent.keyManagerGet({ kid })
  }

  async createDid(): Promise<IIdentifier> {
    throw new Error('Not supported')
  }

  async listDids() {
    return [(await this.importDid()).did]
  }

  async resolveDid(did: string) {
    return await this.agent.resolveDid({ didUrl: did })
  }

  async getDid(did: string) {
    return await this.agent.didManagerGet({ did })
  }

  async importDid(): Promise<IIdentifier> {
    if (!this.agent) throw new Error('No initialised agent found.')
    if (!(ISSUER_DID && ISSUER_ID_PUBLIC_KEY_HEX && ISSUER_ID_PRIVATE_KEY_HEX)) throw new Error('No DIDs and Keys found')

    const [kms] = await this.agent.keyManagerGetKeyManagementSystems()

    if (!ISSUER_DID.match(cheqdDidRegex)) {
      throw new Error('Invalid DID')
    }

    const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: ISSUER_ID_PUBLIC_KEY_HEX, privateKeyHex: ISSUER_ID_PRIVATE_KEY_HEX, publicKeyHex: ISSUER_ID_PUBLIC_KEY_HEX }

    const identifier: IIdentifier = await this.agent.didManagerImport({ keys: [key], did: ISSUER_DID, controllerKeyId: key.kid } as MinimalImportableIdentifier)

    return identifier
  }

  async createResource(network: string, payload: ResourcePayload) {
    try {
        // import DID
        await this.importDid()
        if (!this.agent) throw new Error('No initialised agent found.')

        const [kms] = await this.agent.keyManagerGetKeyManagementSystems()

        const result: boolean = await this.agent.cheqdCreateLinkedResource({
            kms,
            payload,
            network: network as CheqdNetwork
        }
        )
        return result
    } catch (error) {
        throw new Error(`${error}`)
    }    
  }

  async createCredential(credential: CredentialPayload, format: CredentialRequest['format']): Promise<VerifiableCredential> {
    try {
        // import DID
        await this.importDid()
        const verifiable_credential = await this.agent.createVerifiableCredential(
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

  async verifyCredential(credential: VerifiableCredential | string): Promise<IVerifyResult> {
    return await this.agent.verifyCredential({ credential, fetchRemoteContexts: true })
  }

  async verifyPresentation(presentation: VerifiablePresentation | string): Promise<IVerifyResult> {
    return await this.agent.verifyPresentation({ presentation, fetchRemoteContexts: true })
  }
}
