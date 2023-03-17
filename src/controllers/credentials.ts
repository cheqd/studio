import type { Request, Response } from 'express'

import { Credentials } from '../services/credentials'
import { check, validationResult } from 'express-validator'

export class CredentialController {

    public static issueValidator = [
        check('subjectDid')
        .exists().withMessage('subjectDid is required')
        .isString().withMessage('subjectDid should be a string')
        .contains('did:').withMessage('subjectDid should be a DID'),
        check('attributes')
        .exists().withMessage('attributes are required')
        .isObject().withMessage('attributes should be an object'),
        check('type').optional().isArray().withMessage('type should be a string array'),
        check('@context').optional().isArray().withMessage('@context should be a string array'),
        check('expirationDate').optional().isDate().withMessage('Invalid expiration date')
    ]

    public static verifyValidator = [
        check('credential').exists().withMessage('W3c verifiable credential was not provided')
    ]

    public async issue(request: Request, response: Response) {
        const result = validationResult(request);
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }
        
        response.json(await Credentials.instance.issue_credential(request.body))
	}

    public async verify(request: Request, response: Response) {
        if (request?.headers && (!request.headers['content-type'] || request.headers['content-type'] != 'application/json')) {
            return response.status(405).json({ error: 'Unsupported media type.' })
        }

        const result = validationResult(request);
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }
        
		return response.json(await Credentials.instance.verify_credentials(request.body.credential))
	}

}
