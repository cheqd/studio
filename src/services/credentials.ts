import { IVerifyResult, W3CVerifiableCredential } from '@veramo/core'

import {
  VC_CONTEXT,
  VC_PROOF_FORMAT,
  VC_REMOVE_ORIGINAL_FIELDS,
  VC_TYPE
} from '../types/constants.js'
import { CredentialPayload, CredentialRequest, VerifiableCredential, Credential } from '../types/types.js'
import { Identity } from './identity.js'
import { VeridaService } from '../services/connectors/verida.js'
import { v4 } from 'uuid'
import * as dotenv from 'dotenv'
dotenv.config()

const { USE_VERIDA_CONNECTOR } = process.env

export class Credentials {
    public static instance = new Credentials()

    async issue_credential(request: CredentialRequest, agentId: string): Promise<Credential> {
        const credential: CredentialPayload = {
            '@context': [ ...request['@context'] || [], ...VC_CONTEXT ],
            type: [ ...request.type || [], VC_TYPE ],
            issuer: { id: request.issuerDid },
            credentialSubject: {
                id: request.subjectDid,
                ...request.attributes
            },
            issuanceDate: new Date().toISOString()
        }

        if(request.expirationDate) {
            credential.expirationDate = request.expirationDate
        }

        const agent = await Identity.instance.create_agent(agentId)
		const verifiable_credential: VerifiableCredential = await agent.execute(
			'createVerifiableCredential',
			{
				save: false,
				credential,
				proofFormat: request.format || VC_PROOF_FORMAT,
				removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS
			}
		)

		if (verifiable_credential?.vc) delete verifiable_credential.vc
		if (verifiable_credential?.sub) delete verifiable_credential.sub
		if (verifiable_credential?.iss) delete verifiable_credential.iss
		if (verifiable_credential?.nbf) delete verifiable_credential.nbf
		if (verifiable_credential?.exp) delete verifiable_credential.exp
        
        if (USE_VERIDA_CONNECTOR && request.subjectDid.startsWith('did:vda')) {
          await VeridaService.instance.sendCredential(
            request.subjectDid,
            "New Verifiable Credential",
            verifiable_credential,
            request.credentialName || v4(),
            request.credentialSummary
          )
        }
        return verifiable_credential
	}

	async verify_credentials(credential: W3CVerifiableCredential | string, agentId: string): Promise<IVerifyResult> {
        const agent = await Identity.instance.create_agent(agentId)
		const result = await agent.execute(
			'verifyCredential',
			{
				credential
			}
		)
        delete(result.payload)
        return result
	}
}
