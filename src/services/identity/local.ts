import * as dotenv from 'dotenv';
import type { IIdentifier, CredentialPayload, VerifiableCredential, IVerifyResult } from '@veramo/core';
import { MemoryPrivateKeyStore } from '@veramo/key-manager';
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
	TransactionResult,
	LitCompatibleCosmosChains,
	LitNetworks,
} from '@cheqd/did-provider-cheqd';
import { CheqdNetwork } from '@cheqd/sdk';
import type { VerificationOptions } from '../../types/credential.js';
import type { FeePaymentOptions } from '../../types/credential-status.js';
import type { CredentialRequest } from '../../types/credential.js';
import type { CheckStatusListOptions } from '../../types/credential-status.js';
import type { StatusOptions } from '../../types/credential-status.js';
import type {
	BroadcastStatusListOptions, CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions, UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions
} from '../../types/credential-status.js';
import { DefaultIdentityService } from './default.js';
import { Connection } from '../../database/connection/connection.js';
import { Veramo } from './agent.js';

dotenv.config();

const {
	MAINNET_RPC_URL,
	TESTNET_RPC_URL,
	DEFAULT_FEE_PAYER_MNEMONIC,
	ISSUER_PUBLIC_KEY_HEX,
	ISSUER_PRIVATE_KEY_HEX,
	ISSUER_DID,
} = process.env;

export class LocalIdentityService extends DefaultIdentityService {
	constructor() {
		super();
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

		const mainnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
			networkType: CheqdNetwork.Mainnet,
			rpcUrl: MAINNET_RPC_URL || DefaultRPCUrls.mainnet,
			dkgOptions: {
				chain: LitCompatibleCosmosChains.cheqdMainnet,
				network: LitNetworks.serrano,
			},
		});

		const testnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
			networkType: CheqdNetwork.Testnet,
			rpcUrl: TESTNET_RPC_URL || DefaultRPCUrls.testnet,
			dkgOptions: {
				chain: LitCompatibleCosmosChains.cheqdTestnet,
				network: LitNetworks.serrano,
			},
		});

		this.agent = Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				local: new KeyManagementSystem(new MemoryPrivateKeyStore()),
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

	async getKey(kid: string) {
		return Veramo.instance.getKey(this.initAgent(), kid);
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

	async getDid(did: string) {
		return Veramo.instance.getDid(this.initAgent(), did);
	}

	async importDid(): Promise<IIdentifier> {
		if (!(ISSUER_DID && ISSUER_PUBLIC_KEY_HEX && ISSUER_PRIVATE_KEY_HEX)) throw new Error('No DIDs and Keys found');
		try {
			return await this.getDid(ISSUER_DID);
		} catch {
			const key = {
				kid: ISSUER_PUBLIC_KEY_HEX,
				type: 'Ed25519' as const,
				privateKeyHex: ISSUER_PRIVATE_KEY_HEX,
				publicKeyHex: ISSUER_PUBLIC_KEY_HEX,
			};
			const identifier: IIdentifier = await Veramo.instance.importDid(
				this.initAgent(),
				ISSUER_DID,
				[key],
				key.kid
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
			return await Veramo.instance.issueCredential(this.initAgent(), credential, format, statusListOptions);
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

	async createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusListOptions: CreateUnencryptedStatusListOptions
	): Promise<CreateStatusList2021Result> {
		await this.importDid();
		return await Veramo.instance.createUnencryptedStatusList2021(
			this.initAgent(),
			did,
			resourceOptions,
			statusListOptions
		);
	}

	async createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusListOptions: CreateEncryptedStatusListOptions
	): Promise<CreateStatusList2021Result> {
		await this.importDid();
		return await Veramo.instance.createEncryptedStatusList2021(
			this.initAgent(),
			did,
			resourceOptions,
			statusListOptions
		);
	}

	async updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		await this.importDid();
		return await Veramo.instance.updateUnencryptedStatusList2021(this.initAgent(), did, statusOptions);
	}

	async updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		await this.importDid();
		return await Veramo.instance.updateEncryptedStatusList2021(this.initAgent(), did, statusOptions);
	}

	async checkStatusList2021(did: string, statusOptions: CheckStatusListOptions): Promise<StatusCheckResult> {
		return await Veramo.instance.checkStatusList2021(this.initAgent(), did, statusOptions);
	}

	async broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions
	): Promise<boolean> {
		return await Veramo.instance.broadcastStatusList2021(this.initAgent(), did, resourceOptions, statusOptions);
	}

	async remunerateStatusList2021(feePaymentOptions: FeePaymentOptions): Promise<TransactionResult> {
		return await Veramo.instance.remunerateStatusList2021(this.initAgent(), feePaymentOptions);
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
