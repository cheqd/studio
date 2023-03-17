import type { Request, Response } from 'express'
import { GuardedCredentials } from '../middleware/guard'
import { applyMixins } from '../middleware/_'
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

		switch (request.params.type) {
			case 'Ticket':
				const body = request.body
				return await Credentials.instance.issue_ticket_credential(body.data, body.subjectId)
			default:
				applyMixins(GuardedCredentials, [Credentials])

				const credentials = new GuardedCredentials()

				const { authenticated, user, subjectId, provider, error } = await credentials.guard(request)

				if (!(authenticated)) {
					return response.status(400).json({
                        message: JSON.stringify(error)
                    })
				}
				const verifiable_credential = await credentials.issue_person_credential(user, provider, subjectId)
                return response.status(200).json(verifiable_credential)
		}
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
