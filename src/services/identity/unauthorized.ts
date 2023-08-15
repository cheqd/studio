import { LocalIdentity } from './local.js';
import type { VerifiableCredential, IVerifyResult, VerifiablePresentation } from '@veramo/core';
import { MemoryPrivateKeyStore } from '@veramo/key-manager';
import { KeyManagementSystem } from '@veramo/kms-local';

import { type CheckStatusListOptions, type VerificationOptions, DefaultRPCUrl } from '../../types/shared.js';
import { Connection } from '../../database/connection/connection.js';
import { Veramo } from './agent.js';
import { CheqdDIDProvider, type StatusCheckResult } from '@cheqd/did-provider-cheqd';
import { CheqdNetwork } from '@cheqd/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const { MAINNET_RPC_URL, TESTNET_RPC_URL } = process.env;

export class Unauthorized extends LocalIdentity {
	initAgent() {
		if (this.agent) {
			return this.agent;
		}
		const dbConnection = Connection.instance.dbConnection;
		this.privateStore = new MemoryPrivateKeyStore();
		const mainnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: '',
			networkType: CheqdNetwork.Mainnet,
			rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
		});
		const testnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: '',
			networkType: CheqdNetwork.Testnet,
			rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
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

	async getDid(did: string) {
		return Veramo.instance.getDid(this.initAgent(), did);
	}

	async verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		agentId?: string
	): Promise<IVerifyResult> {
		return await Veramo.instance.verifyCredential(this.initAgent(), credential, verificationOptions);
	}

	async verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		agentId?: string
	): Promise<IVerifyResult> {
		return await Veramo.instance.verifyPresentation(this.initAgent(), presentation, verificationOptions);
	}

	async checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		agentId?: string
	): Promise<StatusCheckResult> {
		return await Veramo.instance.checkStatusList2021(this.initAgent(), did, statusOptions);
	}
}
