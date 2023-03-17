import {
	IIdentifier,
	MinimalImportableIdentifier,
	MinimalImportableKey,
	TAgent,
} from '@veramo/core'
import { cheqdDidRegex } from '../types/types'
import { v4 } from 'uuid'

require('dotenv').config()

const { 
  ISSUER_ID_PRIVATE_KEY_HEX,
  ISSUER_ID_PUBLIC_KEY_HEX,
  ISSUER_ID
} = process.env

export class Identity {
	agent: TAgent<any>

	constructor(agent: TAgent<any>, mode?: string) {
		this.agent = agent
		if (mode === 'demo') return
	}

	async load_issuer_did(agent: TAgent<any>): Promise<IIdentifier> {
		if (!this.agent && !agent) throw new Error('No initialised agent found.')

		if (agent) this.agent = agent

		const [kms] = await this.agent.keyManagerGetKeyManagementSystems()

        if(!ISSUER_ID.match(cheqdDidRegex)){
            throw new Error('Invalid ISSUER_ID')
        }

		const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: v4(), privateKeyHex: ISSUER_ID_PRIVATE_KEY_HEX, publicKeyHex: ISSUER_ID_PUBLIC_KEY_HEX }

		const identifier: IIdentifier = await this.agent.didManagerImport({ keys: [key], did: ISSUER_ID, controllerKeyId: key.kid } as MinimalImportableIdentifier)

		return identifier
	}
}
