import type {
	CredentialPayload,
	DIDDocument,
	IIdentifier,
	IVerifyResult,
	ManagedKeyInfo,
	VerifiableCredential,
	VerifiablePresentation,
} from '@veramo/core';
import type { AbstractPrivateKeyStore } from '@veramo/key-manager';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
import { PrivateKeyStore } from '@veramo/data-store';
import { CheqdNetwork } from '@cheqd/sdk';
import {
	Cheqd,
	CheqdDIDProvider,
	type ResourcePayload,
	type BulkRevocationResult,
	type BulkSuspensionResult,
	type BulkUnsuspensionResult,
	type CreateStatusList2021Result,
	type StatusCheckResult,
	DefaultRPCUrls,
	TransactionResult,
} from '@cheqd/did-provider-cheqd';
import {
	BroadcastStatusListOptions,
	CheckStatusListOptions,
	DefaultDidUrlPattern,
	CreateUnencryptedStatusListOptions,
	CredentialRequest,
	StatusOptions,
	UpdateUnencryptedStatusListOptions,
	VeramoAgent,
	VerificationOptions,
	CreateEncryptedStatusListOptions,
	FeePaymentOptions,
	UpdateEncryptedStatusListOptions,
} from '../../types/shared.js';
import { Connection } from '../../database/connection/connection.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { CustomerService } from '../customer.js';
import { Veramo } from './agent.js';
import { DefaultIdentityService } from './default.js';
import * as dotenv from 'dotenv';

dotenv.config();

const { MAINNET_RPC_URL, TESTNET_RPC_URL, EXTERNAL_DB_ENCRYPTION_KEY } = process.env;

export class PostgresIdentityService extends DefaultIdentityService {
	privateStore?: AbstractPrivateKeyStore;

	constructor() {
		super();
		this.agent = this.initAgent();
	}

	initAgent() {
		if (this.agent) return this.agent;
		const dbConnection = Connection.instance.dbConnection;
		this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(EXTERNAL_DB_ENCRYPTION_KEY));

		this.agent = Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				postgres: new KeyManagementSystem(this.privateStore),
			},
			providers: {},
			enableCredential: false,
			enableResolver: true,
		});
		return this.agent;
	}

	async createAgent(agentId: string): Promise<VeramoAgent> {
		if (!agentId) {
			throw new Error('Customer not found');
		}
		const customer = (await CustomerService.instance.get(agentId)) as CustomerEntity;
		if (!customer) {
			throw new Error('Customer not found');
		}
		const dbConnection = Connection.instance.dbConnection;

		const privateKey = (await this.getPrivateKey(customer.account))?.privateKeyHex;

		if (!privateKey || !this.privateStore) {
			throw new Error(`No keys is initialized`);
		}

		const mainnetProvider = new CheqdDIDProvider({
			defaultKms: 'postgres',
			cosmosPayerSeed: privateKey,
			networkType: CheqdNetwork.Mainnet,
			rpcUrl: MAINNET_RPC_URL || DefaultRPCUrls.mainnet,
		});
		const testnetProvider = new CheqdDIDProvider({
			defaultKms: 'postgres',
			cosmosPayerSeed: privateKey,
			networkType: CheqdNetwork.Testnet,
			rpcUrl: TESTNET_RPC_URL || DefaultRPCUrls.testnet,
		});

		return Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				postgres: new KeyManagementSystem(this.privateStore),
			},
			providers: {
				'did:cheqd:mainnet': mainnetProvider,
				'did:cheqd:testnet': testnetProvider,
			},
			cheqdProviders: [mainnetProvider, testnetProvider],
			enableCredential: true,
			enableResolver: true,
		});
	}

	async createKey(type: 'Ed25519' | 'Secp256k1' = 'Ed25519', agentId: string): Promise<ManagedKeyInfo> {
		if (!agentId) {
			throw new Error('Customer not found');
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const key = await Veramo.instance.createKey(this.agent!, type);
		if (await CustomerService.instance.find(agentId, {}))
			await CustomerService.instance.update(agentId, { kids: [key.kid] });
		return key;
	}

	async getKey(kid: string, agentId: string) {
		const isOwner = await CustomerService.instance.find(agentId, { kid });
		if (!isOwner) {
			throw new Error(`${kid} not found in wallet`);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return await Veramo.instance.getKey(this.agent!, kid);
	}

	private async getPrivateKey(kid: string) {
		return await this.privateStore?.getKey({ alias: kid });
	}

	async createDid(network: string, didDocument: DIDDocument, agentId: string): Promise<IIdentifier> {
		if (!agentId) {
			throw new Error('Customer not found');
		}
		try {
			const agent = await this.createAgent(agentId);
			const identifier: IIdentifier = await Veramo.instance.createDid(agent, network, didDocument);
			await CustomerService.instance.update(agentId, { dids: [identifier.did] });
			return identifier;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async updateDid(didDocument: DIDDocument, agentId: string): Promise<IIdentifier> {
		if (!agentId) {
			throw new Error('Customer not found');
		}
		try {
			const agent = await this.createAgent(agentId);
			const identifier: IIdentifier = await Veramo.instance.updateDid(agent, didDocument);
			return identifier;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async deactivateDid(did: string, agentId: string): Promise<boolean> {
		if (!agentId) {
			throw new Error('Customer not found');
		}
		try {
			const agent = await this.createAgent(agentId);
			if (!(await CustomerService.instance.find(agentId, { did }))) {
				throw new Error(`${did} not found in wallet`);
			}
			return await Veramo.instance.deactivateDid(agent, did);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listDids(agentId: string) {
		if (!agentId) {
			throw new Error('Customer not found');
		}
		const customer = (await CustomerService.instance.get(agentId)) as CustomerEntity;
		return customer?.dids || [];
	}

	async getDid(did: string) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return await Veramo.instance.getDid(this.agent!, did);
	}

	async importDid(did: string, privateKeyHex: string, publicKeyHex: string, agentId: string): Promise<IIdentifier> {
		if (!did.match(DefaultDidUrlPattern)) {
			throw new Error('Invalid DID');
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const identifier: IIdentifier = await Veramo.instance.importDid(this.agent!, did, privateKeyHex, publicKeyHex);
		await CustomerService.instance.update(agentId, { dids: [identifier.did] });
		return identifier;
	}

	async createResource(network: string, payload: ResourcePayload, agentId: string) {
		try {
			const agent = await this.createAgent(agentId);
			const did = `did:cheqd:${network}:${payload.collectionId}`;
			if (!(await CustomerService.instance.find(agentId, { did }))) {
				throw new Error(`${did} not found in wallet`);
			}
			return await Veramo.instance.createResource(agent, network, payload);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		agentId: string
	): Promise<VerifiableCredential> {
		try {
			const did = typeof credential.issuer == 'string' ? credential.issuer : credential.issuer.id;
			if (!(await CustomerService.instance.find(agentId, { did }))) {
				throw new Error(`${did} not found in wallet`);
			}
			const agent = await this.createAgent(agentId);
			return await Veramo.instance.createCredential(agent, credential, format, statusOptions);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async verifyCredential(
		credential: string | VerifiableCredential,
		verificationOptions: VerificationOptions,
		agentId: string
	): Promise<IVerifyResult> {
		const agent = await this.createAgent(agentId);
		return await Veramo.instance.verifyCredential(agent, credential, verificationOptions);
	}

	async verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		agentId: string
	): Promise<IVerifyResult> {
		const agent = await this.createAgent(agentId);
		return await Veramo.instance.verifyPresentation(agent, presentation, verificationOptions);
	}

	async createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions,
		agentId: string
	): Promise<CreateStatusList2021Result> {
		const agent = await this.createAgent(agentId);
		if (!(await CustomerService.instance.find(agentId, { did }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.createUnencryptedStatusList2021(agent, did, resourceOptions, statusOptions);
	}

	async createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		agentId: string
	): Promise<CreateStatusList2021Result> {
		const agent = await this.createAgent(agentId);
		if (!(await CustomerService.instance.find(agentId, { did }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.createEncryptedStatusList2021(agent, did, resourceOptions, statusOptions);
	}

	async updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		agentId: string
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		const agent = await this.createAgent(agentId);
		if (!(await CustomerService.instance.find(agentId, { did }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.updateUnencryptedStatusList2021(agent, did, statusOptions);
	}

	async updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		agentId: string
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		const agent = await this.createAgent(agentId);
		if (!(await CustomerService.instance.find(agentId, { did }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.updateEncryptedStatusList2021(agent, did, statusOptions);
	}

	async checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		agentId: string
	): Promise<StatusCheckResult> {
		const agent = await this.createAgent(agentId);
		if (!(await CustomerService.instance.find(agentId, { did }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.checkStatusList2021(agent, did, statusOptions);
	}

	async broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		agentId: string
	): Promise<boolean> {
		const agent = await this.createAgent(agentId);
		if (!(await CustomerService.instance.find(agentId, { did }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.broadcastStatusList2021(agent, did, resourceOptions, statusOptions);
	}

	async remunerateStatusList2021(feePaymentOptions: FeePaymentOptions, agentId: string): Promise<TransactionResult> {
		const agent = await this.createAgent(agentId);
		return await Veramo.instance.remunerateStatusList2021(agent, feePaymentOptions);
	}

	async revokeCredentials(
		credentials: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId: string
	) {
		const agent = await this.createAgent(agentId);
		await this.validateCredentialAccess(credentials, agentId);
		return await Veramo.instance.revokeCredentials(agent, credentials, publish);
	}

	async suspendCredentials(
		credentials: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId: string
	) {
		const agent = await this.createAgent(agentId);
		await this.validateCredentialAccess(credentials, agentId);
		return await Veramo.instance.suspendCredentials(agent, credentials, publish);
	}

	async reinstateCredentials(
		credentials: VerifiableCredential | VerifiableCredential[],
		publish: boolean,
		agentId: string
	) {
		const agent = await this.createAgent(agentId);
		await this.validateCredentialAccess(credentials, agentId);
		return await Veramo.instance.unsuspendCredentials(agent, credentials, publish);
	}

	private async validateCredentialAccess(
		credentials: VerifiableCredential | VerifiableCredential[],
		agentId: string
	) {
		credentials = Array.isArray(credentials) ? credentials : [credentials];
		const customer = (await CustomerService.instance.get(agentId)) as CustomerEntity | null;
		if (!customer) {
			throw new Error('Customer not found');
		}

		for (const credential of credentials) {
			const decodedCredential =
				typeof credential === 'string' ? await Cheqd.decodeCredentialJWT(credential) : credential;

			const issuerId =
				typeof decodedCredential.issuer === 'string' ? decodedCredential.issuer : decodedCredential.issuer.id;

			const existsInWallet = customer.dids.find((did) => did === issuerId);

			if (!existsInWallet) {
				throw new Error(`${issuerId} not found in wallet`);
			}
		}
	}
}
