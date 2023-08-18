import type {
	IIdentifier,
	ManagedKeyInfo,
	CredentialPayload,
	VerifiableCredential,
	IVerifyResult,
	VerifiablePresentation,
} from '@veramo/core';
import { AbstractPrivateKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager';
import { KeyManagementSystem } from '@veramo/kms-local';
import {
	CheqdDIDProvider,
	type ResourcePayload,
	type BulkRevocationResult,
	type BulkSuspensionResult,
	type BulkUnsuspensionResult,
	type CreateStatusList2021Result,
	type StatusCheckResult,
	DefaultRPCUrls,
} from '@cheqd/did-provider-cheqd';
import { CheqdNetwork } from '@cheqd/sdk';
import type {
	BroadcastStatusListOptions,
	CheckStatusListOptions,
	CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions,
	CredentialRequest,
	StatusOptions,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
	VeramoAgent,
	VerificationOptions,
} from '../../types/shared.js';
import type { IIdentity } from './index.js';
import { Connection } from '../../database/connection/connection.js';
import { Veramo } from './agent.js';

import * as dotenv from 'dotenv';

dotenv.config();

const {
	MAINNET_RPC_URL,
	TESTNET_RPC_URL,
	DEFAULT_FEE_PAYER_MNEMONIC,
	ISSUER_PUBLIC_KEY_HEX,
	ISSUER_PRIVATE_KEY_HEX,
	ISSUER_DID,
} = process.env;

export class LocalIdentity implements IIdentity {
	agent?: VeramoAgent;
	privateStore?: AbstractPrivateKeyStore;

	constructor() {
		this.agent = this.initAgent();
	}

	initAgent() {
		if (!DEFAULT_FEE_PAYER_MNEMONIC) {
			throw new Error(`No fee payer found`);
		}
		if (this.agent) {
			return this.agent;
		}
		const dbConnection = Connection.instance.dbConnection;
		this.privateStore = new MemoryPrivateKeyStore();

		const mainnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
			networkType: CheqdNetwork.Mainnet,
			rpcUrl: MAINNET_RPC_URL || DefaultRPCUrls.mainnet,
		});
		const testnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
			networkType: CheqdNetwork.Testnet,
			rpcUrl: TESTNET_RPC_URL || DefaultRPCUrls.testnet,
		});
		this.agent = Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				local: new KeyManagementSystem(this.privateStore),
			},
			providers: {
				'did:cheqd:mainnet': mainnetProvider,
				'did:cheqd:testnet': testnetProvider,
			},
			cheqdProviders: [mainnetProvider, testnetProvider],
			enableCredential: true,
			enableResolver: true,
		});
		return this.agent;
	}

	async createKey(): Promise<ManagedKeyInfo> {
		throw new Error(`Not supported`);
	}

	async getKey(kid: string) {
		return Veramo.instance.getKey(this.initAgent(), kid);
	}

	async createDid(): Promise<IIdentifier> {
		throw new Error('Not supported');
	}

	async updateDid(): Promise<IIdentifier> {
		throw new Error('Not supported');
	}

	async deactivateDid(did: string): Promise<boolean> {
		try {
			return await Veramo.instance.deactivateDid(this.initAgent(), did);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listDids() {
		return [(await this.importDid()).did];
	}

	async resolveDid(did: string) {
		return Veramo.instance.resolveDid(this.initAgent(), did);
	}

	async getDid(did: string) {
		return Veramo.instance.getDid(this.initAgent(), did);
	}

	async importDid(): Promise<IIdentifier> {
		if (!(ISSUER_DID && ISSUER_PUBLIC_KEY_HEX && ISSUER_PRIVATE_KEY_HEX)) throw new Error('No DIDs and Keys found');
		try {
			return await this.getDid(ISSUER_DID);
		} catch {
			const identifier: IIdentifier = await Veramo.instance.importDid(
				this.initAgent(),
				ISSUER_DID,
				ISSUER_PRIVATE_KEY_HEX,
				ISSUER_PUBLIC_KEY_HEX
			);
			return identifier;
		}
	}

	async createResource(network: string, payload: ResourcePayload) {
		try {
			await this.importDid();
			return await Veramo.instance.createResource(this.initAgent(), network, payload);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusListOptions: StatusOptions | null
	): Promise<VerifiableCredential> {
		try {
			await this.importDid();
			return await Veramo.instance.createCredential(this.initAgent(), credential, format, statusListOptions);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions
	): Promise<IVerifyResult> {

		return await Veramo.instance.verifyCredential(this.initAgent(), credential, verificationOptions);
	}

	async verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions
	): Promise<IVerifyResult> {
		return await Veramo.instance.verifyPresentation(this.initAgent(), presentation, verificationOptions);
	}

	async createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusListOptions: CreateUnencryptedStatusListOptions
	): Promise<CreateStatusList2021Result> {
		await this.importDid();
		return await Veramo.instance.createUnencryptedStatusList2021(this.initAgent(), did, resourceOptions, statusListOptions);
	}

	async createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusListOptions: CreateEncryptedStatusListOptions
	): Promise<CreateStatusList2021Result> {
		await this.importDid();
		return await Veramo.instance.createEncryptedStatusList2021(this.initAgent(), did, resourceOptions, statusListOptions);
	}

	async updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		await this.importDid();
		return await Veramo.instance.updateUnencryptedStatusList2021(this.initAgent(), did, statusOptions);
	}

	async updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions,
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		await this.importDid();
		return await Veramo.instance.updateEncryptedStatusList2021(this.initAgent(), did, statusOptions);
	}

	async broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions
	): Promise<boolean> {
		return await Veramo.instance.broadcastStatusList2021(this.initAgent(), did, resourceOptions, statusOptions);
	}

	async checkStatusList2021(did: string, statusOptions: CheckStatusListOptions): Promise<StatusCheckResult> {
		return await Veramo.instance.checkStatusList2021(this.initAgent(), did, statusOptions);
	}

	async revokeCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean) {
		return await Veramo.instance.revokeCredentials(this.initAgent(), credentials, publish);
	}

	async suspendCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean) {
		return await Veramo.instance.suspendCredentials(this.initAgent(), credentials, publish);
	}

	async reinstateCredentials(credentials: VerifiableCredential | VerifiableCredential[], publish: boolean) {
		return await Veramo.instance.unsuspendCredentials(this.initAgent(), credentials, publish);
	}
}
