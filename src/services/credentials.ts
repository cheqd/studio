import { CredentialPayload, IVerifyResult, VerifiableCredential, W3CVerifiableCredential, W3CVerifiablePresentation } from '@veramo/core'

import {
  VC_CONTEXT,
  VC_TYPE
} from '../types/constants.js'
import { CredentialRequest, StatusOptions, VerifyStatusOptions } from '../types/types.js'
import { Identity } from './identity/index.js'
import { VeridaService } from '../services/connectors/verida.js'
import { v4 } from 'uuid'
import * as dotenv from 'dotenv'
dotenv.config()

const { ENABLE_VERIDA_CONNECTOR } = process.env

export class Credentials {
    public static instance = new Credentials()

    async issue_credential(request: CredentialRequest, agentId: string): Promise<VerifiableCredential> {
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

        const statusOptions = request.credentialStatus || null

        let verifiable_credential = await Identity.instance.createCredential(credential, request.format, statusOptions, agentId)
        
        if (ENABLE_VERIDA_CONNECTOR === 'true' && request.subjectDid.startsWith('did:vda')) {
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

	async verify_credentials(credential: W3CVerifiableCredential | string,  statusOptions: VerifyStatusOptions | null, agentId: string): Promise<IVerifyResult> {
		const result = await Identity.instance.verifyCredential(credential, statusOptions, agentId)
        delete(result.payload)
        return result
	}

    async verify_presentation(presentation: W3CVerifiablePresentation, agentId: string): Promise<IVerifyResult> {
        const result = await Identity.instance.verifyPresentation(presentation, agentId)
        return result
    }
}
