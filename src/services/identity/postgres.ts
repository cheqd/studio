import {
  CredentialPayload,
  DIDDocument,
  IDIDManager,
  IIdentifier,
  IKeyManager,
  IResolver,
  IVerifyResult,
  ManagedKeyInfo,
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

import { cheqdDidRegex, CredentialRequest, DefaultRPCUrl, VeramoAgent } from '../../types/types.js'
import { Connection } from '../../database/connection/connection.js'
import { CustomerEntity } from '../../database/entities/customer.entity.js'
import { CustomerService } from '../customer.js'

import { IIdentity } from './IIdentity.js'

import * as dotenv from 'dotenv'
import { Veramo } from './agent.js'
dotenv.config()

const {
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
  RESOLVER_URL,
  EXTERNAL_DB_ENCRYPTION_KEY,
} = process.env

export class PostgresIdentity implements IIdentity {
  agent: TAgent<IKeyManager & IDIDManager & IResolver>
  privateStore?: AbstractPrivateKeyStore
  public static instance = new PostgresIdentity()
  
  constructor() {
    this.agent = this.initAgent()
  }

  initAgent(): TAgent<IKeyManager & IDIDManager & IResolver> {
    if(this.agent) return this.agent
    const dbConnection = Connection.instance.dbConnection
    this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(EXTERNAL_DB_ENCRYPTION_KEY))

    this.agent = Veramo.instance.createVeramoAgent({
        dbConnection,
        kms: {
          local: new KeyManagementSystem(
            this.privateStore
          )
        },
        providers: {},
        enableCredential: false,
        enableResolver: true
    })
    return this.agent
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

    return Veramo.instance.createVeramoAgent({
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
  }

  async createKey(type: 'Ed25519' | 'Secp256k1'='Ed25519', agentId: string): Promise<ManagedKeyInfo> {
    const key = await Veramo.instance.createKey(this.agent, type)
    if(await CustomerService.instance.find(agentId, {})) await CustomerService.instance.update(agentId, { kids: [key.kid] })
    return key
  }

  async getKey(kid: string, agentId: string) {
    const isOwner = await CustomerService.instance.find(agentId, {kid})
    if(!isOwner) {
        throw new Error(`Customer not found`)
    }
    return await Veramo.instance.getKey(this.agent, kid)
  }

  private async getPrivateKey(kid: string) {
    return await this.privateStore!.getKey({ alias: kid })
  }

  async createDid(network: string, didDocument: DIDDocument, agentId: string): Promise<IIdentifier> {
    try {
      const agent = await this.createAgent(agentId)
      if (!agent) throw new Error('No initialised agent found.')

      const identifier: IIdentifier = await Veramo.instance.createDid(agent, network, didDocument)
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
    return await Veramo.instance.resolveDid(this.agent, did)
  }

  async getDid(did: string) {
    return await Veramo.instance.getDid(this.agent, did)
  }

  async importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId: string): Promise<IIdentifier> {
    if (!did.match(cheqdDidRegex)) {
      throw new Error('Invalid DID')
    }

    const identifier: IIdentifier = await Veramo.instance.importDid(this.agent, did, privateKeyHex, publicKeyHex)
    await CustomerService.instance.update(agentId, { dids: [identifier.did]})
    return identifier
  }

  async createResource(network: string, payload: ResourcePayload, agentId: string) {
    try {
        const agent = await this.createAgent(agentId)
        return await Veramo.instance.createResource(agent, network, payload)
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
        return await Veramo.instance.createCredential(agent, credential, format)
    } catch (error) {
        throw new Error(`${error}`)
    }          
  }

  async verifyCredential(credential: string | VerifiableCredential, agentId: string): Promise<IVerifyResult> {
    const agent = await this.createAgent(agentId)
    return await Veramo.instance.verifyCredential(agent, credential)
  }

  async verifyPresentation(presentation: VerifiablePresentation | string, agentId: string): Promise<IVerifyResult> {
    const agent = await this.createAgent(agentId)
    return await Veramo.instance.verifyPresentation(agent, presentation)
  }
}