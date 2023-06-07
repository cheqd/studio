import {
  CredentialPayload,
  DIDDocument,
  IIdentifier,
  IVerifyResult,
  ManagedKeyInfo,
  MinimalImportableIdentifier,
  MinimalImportableKey,
  TAgent,
  VerifiableCredential,
  VerifiablePresentation,
  createAgent,
} from '@veramo/core'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { AbstractPrivateKeyStore, KeyManager } from '@veramo/key-manager'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'
import { KeyStore, DIDStore, PrivateKeyStore } from '@veramo/data-store'
import { CredentialIssuerLD, LdDefaultContexts, VeramoEd25519Signature2018 } from '@veramo/credential-ld'
import { CheqdDIDProvider, getResolver as CheqdDidResolver, ResourcePayload, Cheqd } from '@cheqd/did-provider-cheqd'
import { CheqdNetwork } from '@cheqd/sdk'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { v4 } from 'uuid'

import { cheqdDidRegex, CredentialRequest, DefaultRPCUrl, VeramoAgent } from '../../types/types.js'
import { Connection } from '../../database/connection/connection.js'
import { CustomerEntity } from '../../database/entities/customer.entity.js'
import { CustomerService } from '../customer.js'

import { IIdentity } from './IIdentity.js'
import { VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS } from '../../types/constants.js'

import * as dotenv from 'dotenv'
dotenv.config()

const {
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
  RESOLVER_URL,
  EXTERNAL_DB_ENCRYPTION_KEY,
} = process.env

export class PostgresIdentity implements IIdentity {
  agent?: TAgent<any>
  privateStore?: AbstractPrivateKeyStore
  public static instance = new PostgresIdentity()

  initAgent(): TAgent<any> {
    if(this.agent) return this.agent
    const dbConnection = Connection.instance.dbConnection
    this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(EXTERNAL_DB_ENCRYPTION_KEY))

    return createAgent({
      plugins: [
        new KeyManager({
          store: new KeyStore(dbConnection),
          kms: {
            postgres: new KeyManagementSystem(
              this.privateStore
            )
          }
        }),
        new DIDManager({
          store: new DIDStore(dbConnection),
          defaultProvider: 'did:cheqd:testnet',
          providers: {}
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...CheqdDidResolver({ url: RESOLVER_URL }) as ResolverRegistry
          })
        }),
      ]
    })
  }

  async createAgent(agentId: string) : Promise<VeramoAgent> {
    const customer = await CustomerService.instance.get(agentId) as CustomerEntity
    const dbConnection = Connection.instance.dbConnection

    const privateKey = (await this.getPrivateKey(customer.account)).privateKeyHex
    if (!privateKey || !this.privateStore) {
      throw new Error(`No keys is initialized`)
    }

    const mainnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'postgres',
        cosmosPayerSeed: privateKey,
        networkType: CheqdNetwork.Mainnet as any,
        rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
      }
    )
    const testnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'postgres',
        cosmosPayerSeed: privateKey,
        networkType: CheqdNetwork.Testnet as any,
        rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
      }
    )

    return createAgent<VeramoAgent>({
      plugins: [
        new KeyManager({
          store: new KeyStore(dbConnection),
          kms: {
            postgres: new KeyManagementSystem(
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

  async createKey(type: 'Ed25519' | 'Secp256k1'='Ed25519', agentId: string): Promise<ManagedKeyInfo> {
    const [kms] = await this.initAgent().keyManagerGetKeyManagementSystems()
    const key = await this.initAgent().keyManagerCreate({
      type: type || 'Ed25519',
      kms,
    })
    if(await CustomerService.instance.find(agentId, {})) await CustomerService.instance.update(agentId, { kids: [key.kid] })
    return key
  }

  async getKey(kid: string, agentId: string) {
    const isOwner = await CustomerService.instance.find(agentId, {kid})
    if(!isOwner) {
        throw new Error(`Customer not found`)
    }
    return await this.initAgent().keyManagerGet({ kid })
  }

  private async getPrivateKey(kid: string) {
    return await this.privateStore!.getKey({ alias: kid })
  }

  async createDid(network: string, didDocument: DIDDocument, agentId: string): Promise<IIdentifier> {
    try {
      const agent = await this.createAgent(agentId)
      if (!agent) throw new Error('No initialised agent found.')

      const [kms] = await agent.keyManagerGetKeyManagementSystems()

      const identifier: IIdentifier = await agent.didManagerCreate({
        provider: `did:cheqd:${network}`,
        kms,
        options: {
          document: didDocument
        }
      })
      await CustomerService.instance.update(agentId, { dids: [identifier.did] })
      return identifier
    } catch (error) {
      throw new Error(`${error}`)
    }
  }

  async listDids(agentId: string) {
    const customer = await CustomerService.instance.get(agentId) as CustomerEntity
    return customer?.dids || []
  }

  async resolveDid(did: string) {
    return await this.initAgent().resolveDid({ didUrl: did })
  }

  async getDid(did: string) {
    return await this.initAgent().didManagerGet({ did })
  }

  async importDid(did: string, privateKeyHex: string, publicKeyHex: string): Promise<IIdentifier> {
    const [kms] = await this.initAgent().keyManagerGetKeyManagementSystems()

    if (!did.match(cheqdDidRegex)) {
      throw new Error('Invalid DID')
    }

    const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: v4(), privateKeyHex, publicKeyHex }

    const identifier: IIdentifier = await this.initAgent().didManagerImport({ keys: [key], did, controllerKeyId: key.kid } as MinimalImportableIdentifier)

    return identifier
  }

  async createResource(network: string, payload: ResourcePayload, agentId: string) {
    try {
        const agent = await this.createAgent(agentId)
        if (!agent) throw new Error('No initialised agent found.')

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

  async createCredential(credential: CredentialPayload, format: CredentialRequest['format'], agentId: string): Promise<VerifiableCredential> {
    try {
        const did = typeof(credential.issuer) == 'string' ? credential.issuer : credential.issuer.id
        if (!await CustomerService.instance.find(agentId, {did})) {
          throw new Error('Customer not found')
        }
        const agent = await this.createAgent(agentId)
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

  async verifyCredential(credential: string | VerifiableCredential, agentId: string): Promise<IVerifyResult> {
    const agent = await this.createAgent(agentId)
    return await agent.verifyCredential({ credential, fetchRemoteContexts: true })
  }

  async verifyPresentation(presentation: VerifiablePresentation | string, agentId: string): Promise<IVerifyResult> {
    const agent = await this.createAgent(agentId)
    return await agent.verifyPresentation({ presentation, fetchRemoteContexts: true })
  }
}
