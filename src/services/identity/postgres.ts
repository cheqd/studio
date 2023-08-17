import * as dotenv from 'dotenv'
import type {
	CredentialPayload,
	DIDDocument, 
	IIdentifier, 
	IVerifyResult, 
	ManagedKeyInfo,
	VerifiableCredential, 
	VerifiablePresentation,
} from '@veramo/core'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'
import { PrivateKeyStore } from '@veramo/data-store'
import { CheqdDIDProvider, ResourcePayload } from '@cheqd/did-provider-cheqd'
import { CheqdNetwork } from '@cheqd/sdk'
import {
	BroadCastStatusListOptions,
	CheckStatusListOptions,
	cheqdDidRegex,
	CreateStatusListOptions,
	CredentialRequest,
	DefaultRPCUrl,
	StatusOptions,
	UpdateStatusListOptions,
	VeramoAgent,
	VerificationOptions,
} from '../../types/shared.js'
import type {
	BulkRevocationResult, BulkSuspensionResult, BulkUnsuspensionResult,
	CreateStatusList2021Result, StatusCheckResult,
} from '@cheqd/did-provider-cheqd/build/types/agent/ICheqd.js'
import { Connection } from '../../database/connection/connection.js'
import type { CustomerEntity } from '../../database/entities/customer.entity.js'
import { CustomerService } from '../customer.js'
import { Veramo } from './agent.js'
import { DefaultIdentity } from './identity.js'
import type { AbstractPrivateKeyStore } from '@veramo/key-manager'

dotenv.config()

const {
	MAINNET_RPC_URL,
	TESTNET_RPC_URL,
	EXTERNAL_DB_ENCRYPTION_KEY,
} = process.env

export class PostgresIdentity extends DefaultIdentity {
	privateStore?: AbstractPrivateKeyStore

	initAgent() {
		if (this.agent) return this.agent
		const dbConnection = Connection.instance.dbConnection
		this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(EXTERNAL_DB_ENCRYPTION_KEY))

		this.agent = Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				postgres: new KeyManagementSystem(
					this.privateStore
				)
			},
			providers: {},
			enableCredential: false,
			enableResolver: true
		})
		return this.agent
	}

	async createAgent(agentId: string): Promise<VeramoAgent> {
		if (!agentId) {
			throw new Error('Customer not found')
		}
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
				postgres: new KeyManagementSystem(
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

	async createKey(type: 'Ed25519' | 'Secp256k1' = 'Ed25519', agentId: string): Promise<ManagedKeyInfo> {
		if (!agentId) {
			throw new Error('Customer not found')
		}
		const key = await Veramo.instance.createKey(this.agent!, type)
		if (await CustomerService.instance.find(agentId, {})) await CustomerService.instance.update(agentId, { kids: [key.kid] })
		return key
	}

	async getKey(kid: string, agentId: string) {
		const isOwner = await CustomerService.instance.find(agentId, { kid })
		if (!isOwner) {
			throw new Error(`Customer not found`)
		}
		return await Veramo.instance.getKey(this.agent!, kid)
	}

	private async getPrivateKey(kid: string) {
		return await this.privateStore!.getKey({ alias: kid })
	}

	async createDid(network: string, didDocument: DIDDocument, agentId: string): Promise<IIdentifier> {
		if (!agentId) {
			throw new Error('Customer not found')
		}
		try {
			const agent = await this.createAgent(agentId)
			const identifier: IIdentifier = await Veramo.instance.createDid(agent, network, didDocument)
			await CustomerService.instance.update(agentId, { dids: [identifier.did] })
			return identifier
		} catch (error) {
			throw new Error(`${error}`)
		}
	}

	async updateDid(didDocument: DIDDocument, agentId: string): Promise<IIdentifier> {
		if (!agentId) {
			throw new Error('Customer not found')
		}
		try {
			const agent = await this.createAgent(agentId)
			const identifier: IIdentifier = await Veramo.instance.updateDid(agent, didDocument)
			return identifier
		} catch (error) {
			throw new Error(`${error}`)
		}
	}

	async deactivateDid(did: string, agentId: string): Promise<boolean> {
		if (!agentId) {
			throw new Error('Customer not found')
		}
		try {
			const agent = await this.createAgent(agentId)
			return await Veramo.instance.deactivateDid(agent, did)
		} catch (error) {
			throw new Error(`${error}`)
		}
	}

	async listDids(agentId: string) {
		if (!agentId) {
			throw new Error('Customer not found')
		}
		const customer = await CustomerService.instance.get(agentId) as CustomerEntity
		return customer?.dids || []
	}

	async getDid(did: string) {
		return await Veramo.instance.getDid(this.agent!, did)
	}

	async importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId: string): Promise<IIdentifier> {
		if (!did.match(cheqdDidRegex)) {
			throw new Error('Invalid DID')
		}

		const identifier: IIdentifier = await Veramo.instance.importDid(this.agent!, did, privateKeyHex, publicKeyHex)
		await CustomerService.instance.update(agentId, { dids: [identifier.did] })
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

	async createCredential(credential: CredentialPayload, format: CredentialRequest['format'], statusOptions: StatusOptions | null, agentId: string): Promise<VerifiableCredential> {
		try {
			const did = typeof (credential.issuer) == 'string' ? credential.issuer : credential.issuer.id
			if (!await CustomerService.instance.find(agentId, { did })) {
				throw new Error(`${did} not found in wallet`)
			}
			const agent = await this.createAgent(agentId)
			return await Veramo.instance.createCredential(agent, credential, format, statusOptions)
		} catch (error) {
			throw new Error(`${error}`)
		}
	}

	async verifyCredential(credential: string | VerifiableCredential, verificationOptions: VerificationOptions, agentId: string): Promise<IVerifyResult> {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.verifyCredential(agent, credential, verificationOptions)
	}

	async verifyPresentation(presentation: VerifiablePresentation | string, verificationOptions: VerificationOptions, agentId: string): Promise<IVerifyResult> {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.verifyPresentation(agent, presentation, verificationOptions)
	}

	async createStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: CreateStatusListOptions, agentId: string): Promise<CreateStatusList2021Result> {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.createStatusList2021(agent, did, resourceOptions, statusOptions)
	}

	async updateStatusList2021(did: string, statusOptions: UpdateStatusListOptions, publish: boolean, agentId: string): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.updateStatusList2021(agent, did, statusOptions, publish)
	}

	async checkStatusList2021(did: string, statusOptions: CheckStatusListOptions, agentId: string): Promise<StatusCheckResult> {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.checkStatusList2021(agent, did, statusOptions)
	}

	async broadcastStatusList2021(did: string, resourceOptions: ResourcePayload, statusOptions: BroadCastStatusListOptions, agentId: string): Promise<boolean> {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.broadcastStatusList2021(agent, did, resourceOptions, statusOptions)
	}

	async revokeCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId: string) {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.revokeCredentials(agent, credentials, publish)
	}

	async suspendCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId: string) {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.suspendCredentials(agent, credentials, publish)
	}

	async reinstateCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean, agentId: string) {
		const agent = await this.createAgent(agentId)
		return await Veramo.instance.unsuspendCredentials(agent, credentials, publish)
	}
}
