import type { Request, Response } from 'express'

import { check, validationResult } from 'express-validator'

import { Credentials } from '../services/credentials.js'
import { CustomerService } from '../services/customer.js'

export class CredentialController {

  public static issueValidator = [
    check(['subjectDid', 'issuerDid'])
    .exists().withMessage('DID is required')
    .isString().withMessage('DID should be a string')
    .contains('did:').withMessage('Invalid DID'),
    check('attributes')
    .exists().withMessage('attributes are required')
    .isObject().withMessage('attributes should be an object'),
    check('type').optional().isArray().withMessage('type should be a string array'),
    check('@context').optional().isArray().withMessage('@context should be a string array'),
    check('expirationDate').optional().isDate().withMessage('Invalid expiration date'),
    check('format').optional().isString().withMessage('Invalid credential format')
  ]

  public static verifyValidator = [
    check('credential').exists().withMessage('W3c verifiable credential was not provided')
  ]

  public async issue(request: Request, response: Response) {
    const result = validationResult(request);
    if (!result.isEmpty()) {
      return response.status(400).json({ error: result.array()[0].msg })
    }
    try {
      if (!await CustomerService.instance.find(response.locals.customerId, {did: request.body.issuerDid})) {
        return response.status(400).json({
            error: `Issuer DID ${request.body.issuerDid} not found`
        })
      }
      response.status(200).json(await Credentials.instance.issue_credential(request.body, response.locals.customerId))
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  public async verify(request: Request, response: Response) {
    if (request?.headers && (!request.headers['content-type'] || request.headers['content-type'] != 'application/json')) {
      return response.status(405).json({ error: 'Unsupported media type.' })
    }

    const result = validationResult(request);
    if (!result.isEmpty()) {
      return response.status(400).json({ error: result.array()[0].msg })
    }
    try {
		  return response.status(200).json(await Credentials.instance.verify_credentials(request.body.credential, response.locals.customerId))
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }
}
