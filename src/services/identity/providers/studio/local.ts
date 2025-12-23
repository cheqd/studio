import * as dotenv from 'dotenv';
import type {
	IIdentifier,
	CredentialPayload,
	VerifiableCredential,
	IVerifyResult,
	W3CVerifiableCredential,
} from '@veramo/core';
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
import type { VerificationOptions } from '../../../../types/shared.js';
import type {
	CheqdCredentialStatus,
	CreateEncryptedBitstringOptions,
	CreateUnencryptedBitstringOptions,
	FeePaymentOptions,
} from '../../../../types/credential-status.js';
import type { CredentialRequest } from '../../../../types/credential.js';
import type { CheckStatusListOptions } from '../../../../types/credential-status.js';
import type { StatusOptions } from '../../../../types/credential-status.js';
import type {
	BroadcastStatusListOptions,
	CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
} from '../../../../types/credential-status.js';
import { DefaultIdentityService } from '../../default.js';
import { Connection } from '../../../../database/connection/connection.js';
import { Veramo } from './agent.js';
import type {
	BitstringValidationResult,
	BulkBitstringUpdateResult,
	CreateStatusListResult,
	TPublicKeyEd25519,
} from '@cheqd/did-provider-cheqd';
import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import { toTPublicKeyEd25519 } from '../../../helpers.js';

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
				network: LitNetworks.datildev,
			},
		});

		const testnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: DEFAULT_FEE_PAYER_MNEMONIC,
			networkType: CheqdNetwork.Testnet,
			rpcUrl: TESTNET_RPC_URL || DefaultRPCUrls.testnet,
			dkgOptions: {
				chain: LitCompatibleCosmosChains.cheqdTestnet,
				network: LitNetworks.datildev,
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

	async deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean> {
		try {
			const publicKeys: TPublicKeyEd25519[] =
				publicKeyHexs?.map((key) => {
					return toTPublicKeyEd25519(key);
				}) || [];
			return await Veramo.instance.deactivateDid(this.initAgent(), did, publicKeys);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listDids() {
		const dids = [(await this.importDid()).did];
		return { total: 1, dids };
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

	async createResource(
		network: string,
		payload: ResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	) {
		try {
			await this.importDid();
			const publicKeys: TPublicKeyEd25519[] =
				publicKeyHexs?.map((key) => {
					return toTPublicKeyEd25519(key);
				}) || [];
			return await Veramo.instance.createResource(this.initAgent(), network, payload, publicKeys);
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
	async createUnencryptedBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		statusListOptions: CreateUnencryptedBitstringOptions
	): Promise<CreateStatusListResult> {
		await this.importDid();
		return await Veramo.instance.createUnencryptedBitstringStatusList(
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
	async createEncryptedBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		statusListOptions: CreateEncryptedBitstringOptions
	): Promise<CreateStatusListResult> {
		await this.importDid();
		return await Veramo.instance.createEncryptedBitstringStatusList(
			this.initAgent(),
			did,
			resourceOptions,
			statusListOptions
		);
	}

	async updateUnencryptedStatusList(
		did: string,
		listType: string,
		statusOptions: UpdateUnencryptedStatusListOptions
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult> {
		await this.importDid();
		return await Veramo.instance.updateUnencryptedStatusList(this.initAgent(), did, listType, statusOptions);
	}

	async updateEncryptedStatusList(
		did: string,
		listType: string,
		statusOptions: UpdateEncryptedStatusListOptions
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult> {
		await this.importDid();
		return await Veramo.instance.updateEncryptedStatusList(this.initAgent(), did, listType, statusOptions);
	}

	async checkStatusList2021(did: string, statusOptions: CheckStatusListOptions): Promise<StatusCheckResult> {
		return await Veramo.instance.checkStatusList2021(this.initAgent(), did, statusOptions);
	}

	async checkBitstringStatusList(
		did: string,
		statusOptions: CheqdCredentialStatus
	): Promise<BitstringValidationResult | BitstringValidationResult[]> {
		return await Veramo.instance.checkBitstringStatusList(this.initAgent(), did, statusOptions);
	}

	async broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions
	): Promise<boolean> {
		return await Veramo.instance.broadcastStatusList2021(this.initAgent(), did, resourceOptions, statusOptions);
	}

	async broadcastBitstringStatusList(did: string, resourceOptions: ResourcePayload): Promise<boolean> {
		return await Veramo.instance.broadcastBitstringStatusList(this.initAgent(), did, resourceOptions);
	}

	async remunerateStatusList2021(feePaymentOptions: FeePaymentOptions): Promise<TransactionResult> {
		return await Veramo.instance.remunerateStatusList2021(this.initAgent(), feePaymentOptions);
	}

	async revokeCredentials(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean
	) {
		return await Veramo.instance.revokeCredentials(this.initAgent(), credentials, listType, publish);
	}

	async suspendCredentials(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean
	) {
		return await Veramo.instance.suspendCredentials(this.initAgent(), credentials, listType, publish);
	}

	async reinstateCredentials(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean
	) {
		return await Veramo.instance.unsuspendCredentials(this.initAgent(), credentials, listType, publish);
	}

	async didExists(did: string): Promise<boolean> {
		return await Veramo.instance.didExists(this.initAgent(), did);
	}

	async saveCredential(credential: VerifiableCredential): Promise<string> {
		return await Veramo.instance.saveCredentialToDataStore(this.initAgent(), credential);
	}
}
