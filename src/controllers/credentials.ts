import type { Request, Response } from 'express'

import { CredentialRequest, ProofRequest, W3CVerifiableCredential } from '../types/types'
import { GuardedCredentials } from '../middleware/guard'
import { applyMixins } from '../middleware/_'
import { Credentials } from '../services/credentials'

export class CredentialController {

    public async issue(request: Request, response: Response) {
        return await Credentials.instance.issue_credential({
            holderDid: request.body.did,
            attributes: request.body.attributes,
            context: request.body.context,
            type: request.body.type
        })
	}

    public async verify(request: Request, response: Response) {
        if (request?.headers && (!request.headers['content-type'] || request.headers['content-type'] != 'application/json')) {
            return response.status(405).json({ error: 'Unsupported media type.' })
        }
		const _body: Record<any, any> = request.body
		const _credential = _body['credential']
		const credential_request = { ...request as Request, credential: _credential as W3CVerifiableCredential } as ProofRequest
		const verified = await Credentials.instance.verify_credentials(credential_request)
        return response.json(verified)
	}

}
