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
import { KeyStore, DIDStore, PrivateKeyStore, migrations, Entities } from '@veramo/data-store'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { CheqdDIDProvider, getResolver as CheqdDidResolver } from '@cheqd/did-provider-cheqd'
import { v4 } from 'uuid'
import { DataSource } from 'typeorm'

import { cheqdDidRegex, DefaultRPCUrl } from '../types/types'
import { CheqdNetwork } from '@cheqd/sdk'

require('dotenv').config()

const { 
  ISSUER_ID_PRIVATE_KEY_HEX,
  ISSUER_ID_PUBLIC_KEY_HEX,
  ISSUER_ID,
  ISSUER_SECRET_KEY,
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
  FEE_PAYER_MNEMONIC_MAINNET,
  FEE_PAYER_MNENONIC_TESTNET,
} = process.env

export class Identity {
  agent: TAgent<any>

  public static instance = new Identity()

  constructor() {
    this.agent = this.init_agent()
  }

  init_agent(): TAgent<any> {
    const dbConnection = new DataSource({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'mypassword',
      database: 'postgres',
      migrations,
      entities: Entities,
      ssl: false,
      logging: ['error', 'info', 'warn']
    })
    return createAgent<IDIDManager & IKeyManager & IDataStore & IResolver>({
      plugins: [
        new KeyManager({
          store: new KeyStore(dbConnection),
          kms: {
            local: new KeyManagementSystem(
              new PrivateKeyStore(dbConnection, new SecretBox(ISSUER_SECRET_KEY))
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
                cosmosPayerSeed: FEE_PAYER_MNEMONIC_MAINNET,
                networkType: CheqdNetwork.Mainnet as any,
                rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
              }
            ),
            'did:cheqd:testnet': new CheqdDIDProvider(
              {
                defaultKms: 'local',
                cosmosPayerSeed: FEE_PAYER_MNENONIC_TESTNET,
                networkType: CheqdNetwork.Testnet as any,
                rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
              }
            )
          }
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...CheqdDidResolver() as ResolverRegistry
          })
        }),
        new CredentialPlugin(),
      ]
    })
  }

  async createKey() : Promise<ManagedKeyInfo> {
    if (!this.agent) throw new Error('No initialised agent found.')
    const [kms] = await this.agent.keyManagerGetKeyManagementSystems()
    const key =  await this.agent.keyManagerCreate({
      type: 'Ed25519',
      kms,
    })
    return key
  }

  async getKey(kid: string) {
    return await this.agent.keyManagerGet({ kid })
  }

  async createDid(network: string, didDocument: DIDDocument, alias: string = v4()): Promise<IIdentifier> {
    if (!this.agent) throw new Error('No initialised agent found.')

    const [kms] = await this.agent.keyManagerGetKeyManagementSystems()

    const identifier: IIdentifier = await this.agent.didManagerCreate({
      alias,
      provider: `did:cheqd:${network}`,
      kms,
      options: {
        document: didDocument
      }
    })
    return identifier
  }

  async listDids() {
    return await this.agent.didManagerFind()
  }

  async resolveDid(did: string) {
    return await this.agent.resolveDid(did)
  }

  async importDid(): Promise<IIdentifier> {
    if (!this.agent) throw new Error('No initialised agent found.')

    const [kms] = await this.agent.keyManagerGetKeyManagementSystems()

    if(!ISSUER_ID.match(cheqdDidRegex)){
        throw new Error('Invalid ISSUER_ID')
    }

    const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: v4(), privateKeyHex: ISSUER_ID_PRIVATE_KEY_HEX, publicKeyHex: ISSUER_ID_PUBLIC_KEY_HEX }

    const identifier: IIdentifier = await this.agent.didManagerImport({ keys: [key], did: ISSUER_ID, controllerKeyId: key.kid } as MinimalImportableIdentifier)

    return identifier
  }
}
