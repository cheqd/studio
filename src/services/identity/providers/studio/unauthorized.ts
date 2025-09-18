import { MemoryPrivateKeyStore } from '@veramo/key-manager';
import { KeyManagementSystem } from '@veramo/kms-local';
import { DefaultIdentityService } from '../../default.js';

import { Connection } from '../../../../database/connection/connection.js';
import { Veramo } from './agent.js';
import { CheqdDIDProvider, DefaultRPCUrls } from '@cheqd/did-provider-cheqd';
import { CheqdNetwork } from '@cheqd/sdk';
import * as dotenv from 'dotenv';
dotenv.config();

const { MAINNET_RPC_URL, TESTNET_RPC_URL } = process.env;

export class Unauthorized extends DefaultIdentityService {
	constructor() {
		super();
		this.agent = this.initAgent();
	}

	initAgent() {
		if (this.agent) {
			return this.agent;
		}
		const dbConnection = Connection.instance.dbConnection;
		const mainnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: '',
			networkType: CheqdNetwork.Mainnet,
			rpcUrl: MAINNET_RPC_URL || DefaultRPCUrls.mainnet,
		});
		const testnetProvider = new CheqdDIDProvider({
			defaultKms: 'local',
			cosmosPayerSeed: '',
			networkType: CheqdNetwork.Testnet,
			rpcUrl: TESTNET_RPC_URL || DefaultRPCUrls.testnet,
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
}
