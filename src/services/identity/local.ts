import {
  IIdentifier,
  ManagedKeyInfo,
  CredentialPayload,
  VerifiableCredential,
  IVerifyResult,
  VerifiablePresentation,
} from '@veramo/core'
import { AbstractPrivateKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'
import { CheqdDIDProvider, ResourcePayload } from '@cheqd/did-provider-cheqd'
import { CheqdNetwork } from '@cheqd/sdk'

import { CreateStatusListOptions, CredentialRequest, DefaultRPCUrl, StatusOptions, VeramoAgent, VerifyStatusOptions } from '../../types/types.js'
import { Connection } from '../../database/connection/connection.js'
import { IIdentity } from './IIdentity.js'
import { Veramo } from './agent.js'

import * as dotenv from 'dotenv'

dotenv.config()

const {
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
  DEFAULT_FEE_PAYER_MNEMONIC,
  ISSUER_PUBLIC_KEY_HEX,
  ISSUER_PRIVATE_KEY_HEX,
  ISSUER_DID
} = process.env

export class LocalIdentity implements IIdentity {
  agent?: VeramoAgent
  privateStore?: AbstractPrivateKeyStore
  public static instance = new LocalIdentity()

  constructor() {
    this.agent = this.initAgent()
  }

  initAgent() {
    if (!DEFAULT_FEE_PAYER_MNEMONIC) {
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
        cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
        networkType: CheqdNetwork.Mainnet,
        rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
      }
    )
    const testnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
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
    if (!(ISSUER_DID && ISSUER_PUBLIC_KEY_HEX && ISSUER_PRIVATE_KEY_HEX)) throw new Error('No DIDs and Keys found')
    try {
        return await this.getDid(ISSUER_DID)
    } catch {
        const identifier: IIdentifier = await Veramo.instance.importDid(this.initAgent(), ISSUER_DID, ISSUER_PRIVATE_KEY_HEX, ISSUER_PUBLIC_KEY_HEX)
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

  async createCredential(credential: CredentialPayload, format: CredentialRequest['format'], statusListOptions: StatusOptions | null): Promise<VerifiableCredential> {
    try {
        await this.importDid()
        return await Veramo.instance.createCredential(this.initAgent(), credential, format, statusListOptions)
    } catch (error) {
        throw new Error(`${error}`)
    }          
  }

  async verifyCredential(credential: VerifiableCredential | string,  statusOptions: VerifyStatusOptions | null): Promise<IVerifyResult> {
    return await Veramo.instance.verifyCredential(this.initAgent(), credential, statusOptions)
  }

  async verifyPresentation(presentation: VerifiablePresentation | string): Promise<IVerifyResult> {
    return await Veramo.instance.verifyPresentation(this.initAgent(), presentation)
  }

  async createStatusList2021(did: string, network: string, resourceOptions: ResourcePayload,  statusListOptions: CreateStatusListOptions): Promise<boolean> {
    return await Veramo.instance.createStatusList2021(this.initAgent(), did, network, resourceOptions, statusListOptions)
  }

  async revokeCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId: string) {
    return await Veramo.instance.revokeCredentials(this.initAgent(), credentials, publish)
  }

  async suspendCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId: string) {
    return await Veramo.instance.suspendCredentials(this.initAgent(), credentials, publish)
  }

  async reinstateCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId: string) {
    return await Veramo.instance.unsuspendCredentials(this.initAgent(), credentials, publish)
  }
}
