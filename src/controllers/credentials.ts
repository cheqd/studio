import type { Request, Response } from 'express'

import { Credentials } from '../services/credentials'
import { check, param, validationResult } from 'express-validator'

export class CredentialController {

    public static issueValidator = [
        check('subjectId').exists().withMessage('subjectId is required').isString().withMessage('subjectId should be a string'),
        param('type').optional().isString().withMessage('type should be a string')
    ]

    public static verifyValidator = [
        check('credential').exists().withMessage('W3c verifiable credential was not provided')
    ]

    public async issue(request: Request, response: Response) {
        const result = validationResult(request);
        if (!result.isEmpty()) {
          return response.status(400).json(result.array()[0].msg)
        }
        
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

        const result = validationResult(request);
        if (!result.isEmpty()) {
          return response.status(400).json(result.array()[0].msg)
        }
        
		const verificationResult = await Credentials.instance.verify_credentials(request.body.credential)
        return response.json(verificationResult)
	}

}
