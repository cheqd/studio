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
  ICredentialIssuer,
} from '@veramo/core'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { KeyManager } from '@veramo/key-manager'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'
import { KeyStore, DIDStore, PrivateKeyStore } from '@veramo/data-store'
import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'
import { CheqdDIDProvider, getResolver as CheqdDidResolver, ResourcePayload, Cheqd } from '@cheqd/did-provider-cheqd'
import { ICheqd } from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd.js'
import { CheqdNetwork } from '@cheqd/sdk'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { v4 } from 'uuid'

import { cheqdDidRegex, DefaultRPCUrl } from '../types/types.js'
import { Connection } from '../database/connection/connection.js'
import { CustomerEntity } from '../database/entities/customer.entity.js'
import { CustomerService } from './customer.js'

import * as dotenv from 'dotenv'
dotenv.config()

const { 
  DB_ENCRYPTION_KEY,
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
    this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(DB_ENCRYPTION_KEY))
    return createAgent<IKeyManager>({
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
            }
          }),
          new DIDResolverPlugin({
            resolver: new Resolver({
              ...CheqdDidResolver({url: RESOLVER_URL}) as ResolverRegistry
            })
          }),
      ]
    })
  }

  async create_agent(agentId: string): Promise<TAgent<IDIDManager & IKeyManager & IDataStore & IResolver & ICredentialIssuer & ICheqd>> {
    const customer = await CustomerService.instance.get(agentId) as CustomerEntity
    const dbConnection = Connection.instance.dbConnection
    const privateKey = (await this.getPrivateKey(customer.account)).privateKeyHex
    if (!privateKey || !this.privateStore) {
        throw new Error(`No keys is initialized`)
    }
    const mainnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: privateKey,
        networkType: CheqdNetwork.Mainnet as any,
        rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
      }
    )
    const testnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: privateKey,
        networkType: CheqdNetwork.Testnet as any,
        rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
      }
    )

    return createAgent<IDIDManager & IKeyManager & IDataStore & IResolver & ICredentialIssuer & ICheqd>({
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
            ...CheqdDidResolver({url: RESOLVER_URL}) as ResolverRegistry
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

  async createDid(network: string, didDocument: DIDDocument, agentId?: string): Promise<IIdentifier> {
    try {
    const agentService = agentId ? await this.create_agent(agentId) : this.agent
    if (!agentService) throw new Error('No initialised agent found.')

    const [kms] = await agentService.keyManagerGetKeyManagementSystems()

    const identifier: IIdentifier = await agentService.didManagerCreate({
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
    return await this.agent.resolveDid({didUrl: did})
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

  async createResource(network: string, payload: ResourcePayload, agentId?: string) {
    try {
    const agentService = agentId ? await this.create_agent(agentId) : this.agent
    if (!agentService) throw new Error('No initialised agent found.')

    const [kms] = await agentService.keyManagerGetKeyManagementSystems()

    const result: boolean = await agentService.execute(
        'cheqdCreateLinkedResource',
      {
        kms,
        payload,
        network
      }
    )
    return result
    } catch (error) {
        throw new Error(`${error}`)
    }    
  }
}
