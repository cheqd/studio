import {
	IIdentifier,
	MinimalImportableIdentifier,
	MinimalImportableKey,
	TAgent,
} from '@veramo/core'
import * as dotenv from 'dotenv'
dotenv.config()

const {
	ISSUER_ID_KID, 
	ISSUER_ID_PRIVATE_KEY_HEX, 
	ISSUER_ID_METHOD_SPECIFIC_ID, 
	ISSUER_ID_METHOD, 
	ISSUER_ID_PUBLIC_KEY_HEX
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

		const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: ISSUER_ID_KID, privateKeyHex: ISSUER_ID_PRIVATE_KEY_HEX, publicKeyHex: ISSUER_ID_PUBLIC_KEY_HEX }

		const methodSpecificId = ISSUER_ID_METHOD_SPECIFIC_ID

		const issuerDidMethod = ISSUER_ID_METHOD

		const identifier: IIdentifier = await this.agent.didManagerImport({ keys: [key], did: issuerDidMethod + methodSpecificId, controllerKeyId: key.kid } as MinimalImportableIdentifier)

		return identifier
	}
}
