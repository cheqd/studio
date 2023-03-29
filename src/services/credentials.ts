import {
  IVerifyResult,
  TAgent,
  W3CVerifiableCredential
} from '@veramo/core'
import { VC_CONTEXT, VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS, VC_TYPE } from '../types/constants'
import { CredentialPayload, CredentialRequest, VerifiableCredential, Credential } from '../types/types'
import { Identity } from './identity'

require('dotenv').config()

export class Credentials {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	agent: TAgent<any>

	constructor() {
	  this.agent = Identity.instance.agent
	}

    public static instance = new Credentials()

    async issue_credential(request: CredentialRequest): Promise<Credential> {
		const issuer_id = await this.agent.load_issuer_did()

        const credential: CredentialPayload = {
            '@context': [ ...request['@context'] || [], ...VC_CONTEXT ],
            type: [ ...request.type || [], VC_TYPE ],
            issuer: { id: issuer_id.did },
            credentialSubject: {
                id: request.subjectDid,
                type: undefined
            },
            issuanceDate: new Date().toISOString(),
            ...request.attributes
        }

        if(request.expirationDate) {
            credential.expirationDate = request.expirationDate
        }

		const verifiable_credential: Omit<VerifiableCredential, 'vc'> = await this.agent.execute(
			'createVerifiableCredential',
			{
				save: false,
				credential,
				proofFormat: VC_PROOF_FORMAT,
				removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS
			}
		)

		if (verifiable_credential?.vc) delete verifiable_credential.vc
		if (verifiable_credential?.sub) delete verifiable_credential.sub
		if (verifiable_credential?.iss) delete verifiable_credential.iss
		if (verifiable_credential?.nbf) delete verifiable_credential.nbf
		if (verifiable_credential?.exp) delete verifiable_credential.exp

        return verifiable_credential
	}

	async verify_credentials(credential: W3CVerifiableCredential | string): Promise<IVerifyResult> {
		const result = await this.agent?.execute(
			'verifyCredential',
			{
				credential
			}
		)
        delete(result.payload)
        return result
	}

	// private get_network_ns_config(issuer_id: string): NetworkType {
	// 	// did:cheqd:<network>:<uuid>
	// 	const parts = issuer_id.split(':')
	// 	const ns = parts[2]

	// 	return this.validateNetworkNS(ns as NetworkType)
	// }

	// validateNetworkNS(ns: NetworkType): NetworkType {
	// 	return ns
	// }
}
