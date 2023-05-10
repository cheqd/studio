import {
  DIDDocument,
  IIdentifier,
  ManagedKeyInfo,
  MinimalImportableIdentifier,
  MinimalImportableKey,
  TAgent,
  createAgent,
  IDataStore,
  IDIDManager,
  IKeyManager,
  IResolver,
} from '@veramo/core'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { KeyManager } from '@veramo/key-manager'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'
import { KeyStore, DIDStore, PrivateKeyStore } from '@veramo/data-store'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { CheqdDIDProvider, getResolver as CheqdDidResolver } from '@cheqd/did-provider-cheqd'
import { v4 } from 'uuid'

import { cheqdDidRegex, DefaultRPCUrl } from '../types/types'
import { CheqdNetwork } from '@cheqd/sdk'
import { Connection } from '../database/connection/connection'

// TODO: for jsonLD
// import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'

require('dotenv').config()

const { 
  ISSUER_SECRET_KEY,
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
  RESOLVER_URL,
} = process.env

export class Identity {
  agent: TAgent<any>
  privateStore?: PrivateKeyStore
  public static instance = new Identity()

  constructor() {
    this.agent = this.init_agent()
  }

  init_agent(): TAgent<any> {
    const dbConnection = Connection.instance.dbConnection
    this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(ISSUER_SECRET_KEY))
    return createAgent<IKeyManager>({
      plugins: [
        new KeyManager({
          store: new KeyStore(dbConnection),
          kms: {
            local: new KeyManagementSystem(
              this.privateStore
            )
          }
        })
      ]
    })
  }

  async create_agent(kid: string): Promise<TAgent<any>> {
    const dbConnection = Connection.instance.dbConnection
    const privateKey = (await this.getPrivateKey(kid)).privateKeyHex
    if (!privateKey || !this.privateStore) {
        throw new Error(`No keys is initialized`)
    }
    return createAgent<IDIDManager & IKeyManager & IDataStore & IResolver>({
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
            'did:cheqd:mainnet': new CheqdDIDProvider(
              {
                defaultKms: 'local',
                cosmosPayerSeed: privateKey,
                networkType: CheqdNetwork.Mainnet as any,
                rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
              }
            ),
            'did:cheqd:testnet': new CheqdDIDProvider(
              {
                defaultKms: 'local',
                cosmosPayerSeed: privateKey,
                networkType: CheqdNetwork.Testnet as any,
                rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
              }
            )
          }
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...CheqdDidResolver({ url: RESOLVER_URL }) as ResolverRegistry
          })
        }),
        new CredentialPlugin(),
        // TODO: JsonLD
        // new CredentialIssuerLD({
        //     contextMaps: [LdDefaultContexts],
        //     suites: [new VeramoEd25519Signature2018()]
        // })
      ]
    })
  }

  async createKey(type?: 'Ed25519' | 'Secp256k1') : Promise<ManagedKeyInfo> {
    if (!this.agent) throw new Error('No initialised agent found.')
    const [kms] = await this.agent.keyManagerGetKeyManagementSystems()
    const key =  await this.agent.keyManagerCreate({
      type: type || 'Ed25519',
      kms,
    })
    return key
  }

  async getKey(kid: string) {
    return await this.agent.keyManagerGet({ kid })
  }

  private async getPrivateKey(kid: string) {
    return await this.privateStore!.getKey({ alias: kid })
  }

  async createDid(network: string, didDocument: DIDDocument, alias: string = v4(), agentId?: string): Promise<IIdentifier> {
    try {
    const agentService = agentId ? await this.create_agent(agentId) : this.agent
    if (!agentService) throw new Error('No initialised agent found.')

    const [kms] = await agentService.keyManagerGetKeyManagementSystems()

    const identifier: IIdentifier = await agentService.didManagerCreate({
      alias,
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

  async listDids() {
    return await this.agent.didManagerFind()
  }

  async resolveDid(did: string) {
    return await this.agent.resolveDid(did)
  }

  async getDid(did: string) {
    return await this.agent.didManagerGet({did})
  }

  async importDid(did: string, privateKeyHex: string, publicKeyHex: string): Promise<IIdentifier> {
    if (!this.agent) throw new Error('No initialised agent found.')

    const [kms] = await this.agent.keyManagerGetKeyManagementSystems()

    if(!did.match(cheqdDidRegex)){
        throw new Error('Invalid DID')
    }

    const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: v4(), privateKeyHex, publicKeyHex }

    const identifier: IIdentifier = await this.agent.didManagerImport({ keys: [key], did, controllerKeyId: key.kid } as MinimalImportableIdentifier)

    return identifier
  }
}
