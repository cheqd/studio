import { MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'

import { DefaultRPCUrl } from '../../types/types.js'
import { Connection } from '../../database/connection/connection.js'
import { Veramo } from './agent.js'
import { CheqdDIDProvider } from "@cheqd/did-provider-cheqd";
import { CheqdNetwork } from '@cheqd/sdk'
import * as dotenv from 'dotenv'
import { AbstractIdentity } from "./InterfaceIdentity.js";

dotenv.config()

const {
  MAINNET_RPC_URL,
  TESTNET_RPC_URL
} = process.env

export class Unauthorized extends AbstractIdentity {
  constructor() {
    super();
    this.agent = this.initAgent()
  }

  initAgent() {
    if (this.agent) {
      return this.agent
    }
    const dbConnection = Connection.instance.dbConnection
    this.privateStore = new MemoryPrivateKeyStore()
    const mainnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: "",
        networkType: CheqdNetwork.Mainnet,
        rpcUrl: MAINNET_RPC_URL || DefaultRPCUrl.Mainnet,
      }
    )
    const testnetProvider = new CheqdDIDProvider(
      {
        defaultKms: 'local',
        cosmosPayerSeed: "",
        networkType: CheqdNetwork.Testnet,
        rpcUrl: TESTNET_RPC_URL || DefaultRPCUrl.Testnet,
      }
    )

    this.agent = Veramo.instance.createVeramoAgent({
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
    return this.agent
  }
}