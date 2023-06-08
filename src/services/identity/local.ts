import {
  IIdentifier,
  ManagedKeyInfo,
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
import { CredentialPlugin } from '@veramo/credential-w3c'
import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'

import { CredentialRequest, DefaultRPCUrl, VeramoAgent } from '../../types/types.js'
import { Connection } from '../../database/connection/connection.js'
import { IIdentity } from './IIdentity.js'
import { Veramo } from './agent.js'

import * as dotenv from 'dotenv'

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
  agent?: VeramoAgent
  privateStore?: AbstractPrivateKeyStore
  public static instance = new LocalIdentity()

  initAgent() {
    if (!FEE_PAYER_MNEMONIC) {
        throw new Error(`No fee payer found`)
    }
    if(this.agent) {
        return this.agent
    }
    const dbConnection = Connection.instance.dbConnection
    this.privateStore = new MemoryPrivateKeyStore()

    const mainnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: FEE_PAYER_MNEMONIC,
        networkType: CheqdNetwork.Mainnet,
        rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
      }
    )
    const testnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: FEE_PAYER_MNEMONIC,
        networkType: CheqdNetwork.Testnet,
        rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
      }
    )
    this.agent = Veramo.instance.createVeramoAgent({
        dbConnection,
        kms: {
          local: new KeyManagementSystem(
            this.privateStore
          )
        },
        providers: {
          'did:cheqd:mainnet': mainnetProvider,
          'did:cheqd:testnet': testnetProvider
        },
        cheqdProviders: [mainnetProvider, testnetProvider],
        enableCredential: true,
        enableResolver: true
    })
    return this.agent
  }

  async createKey(): Promise<ManagedKeyInfo> {
    throw new Error(`Not supported`)
  }

  async getKey(kid: string) {
    return Veramo.instance.getKey(this.initAgent(), kid)
  }

  async createDid(): Promise<IIdentifier> {
    throw new Error('Not supported')
  }

  async listDids() {
    return [(await this.importDid()).did]
  }

  async resolveDid(did: string) {
    return Veramo.instance.resolveDid(this.initAgent(), did)
  }

  async getDid(did: string) {
    return Veramo.instance.getDid(this.initAgent(), did)
  }

  async importDid(): Promise<IIdentifier> {
    if (!(ISSUER_DID && ISSUER_ID_PUBLIC_KEY_HEX && ISSUER_ID_PRIVATE_KEY_HEX)) throw new Error('No DIDs and Keys found')
    try {
        return await this.getDid(ISSUER_DID)
    } catch {
        const identifier: IIdentifier = await Veramo.instance.importDid(this.initAgent(), ISSUER_DID, ISSUER_ID_PRIVATE_KEY_HEX, ISSUER_ID_PUBLIC_KEY_HEX)
        return identifier
    }
  }

  async createResource(network: string, payload: ResourcePayload) {
    try {
        await this.importDid()
        return await Veramo.instance.createResource(this.initAgent(), network, payload)
    } catch (error) {
        throw new Error(`${error}`)
    }    
  }

  async createCredential(credential: CredentialPayload, format: CredentialRequest['format']): Promise<VerifiableCredential> {
    try {
        await this.importDid()
        return await Veramo.instance.createCredential(this.initAgent(), credential, format)
    } catch (error) {
        throw new Error(`${error}`)
    }          
  }

  async verifyCredential(credential: VerifiableCredential | string): Promise<IVerifyResult> {
    return await Veramo.instance.verifyCredential(this.initAgent(), credential)
  }

  async verifyPresentation(presentation: VerifiablePresentation | string): Promise<IVerifyResult> {
    return await Veramo.instance.verifyPresentation(this.initAgent(), presentation)
  }
}
