import type { Request, Response } from 'express'
import type { VerifiableCredential } from '@veramo/core'

import { check, query, validationResult } from 'express-validator'

import { Credentials } from '../services/credentials.js'
import { Identity } from '../services/identity/index.js'

export class CredentialController {

  public static issueValidator = [
    check(['subjectDid', 'issuerDid'])
    .exists().withMessage('DID is required')
    .isString().withMessage('DID should be a string')
    .contains('did:').withMessage('Invalid DID'),
    check('attributes')
    .exists().withMessage('attributes are required')
    .isObject().withMessage('attributes should be an object'),
    check('expirationDate').optional().isDate().withMessage('Invalid expiration date'),
    check('format').optional().isString().withMessage('Invalid credential format')
  ]

  public static credentialValidator = [
    check('credential').exists().withMessage('W3c verifiable credential was not provided')
    .custom((value) => {
        if (typeof value === 'string' || typeof value === 'object') {
          return true
        }
        return false
      })
    .withMessage('Entry must be a jwt string or an credential'),
    query('publish').optional().isBoolean().withMessage('publish should be a boolean value')
  ]

  public static presentationValidator = [
    check('presentation').exists().withMessage('W3c verifiable presentation was not provided')
    .custom((value) => {
        if (typeof value === 'string' || typeof value === 'object') {
          return true
        }
        return false
      })
    .withMessage('Entry must be a jwt string or a presentation'),
  ]

  public async issue(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
      return response.status(400).json({ error: result.array()[0].msg })
    }

    // Handles string input instead of an array
    if(typeof request.body.type === 'string') {
        request.body.type = [request.body.type]
    }
    if(typeof request.body['@context'] === 'string') {
        request.body['@context'] = [request.body['@context']]
    }

    try {
      const credential: VerifiableCredential = await Credentials.instance.issue_credential(request.body, response.locals.customerId)
      response.status(200).json(credential)
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

    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }
    try {
        const result = await Credentials.instance.verify_credentials(request.body.credential, request.body.statusOptions, response.locals.customerId)
        if (result.error) {
            return response.status(400).json({
                verified: result.verified,
                error: result.error
            })
        }
		return response.status(200).json(result)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  public async revoke(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }
    
    const publish = request.query.publish === 'false' ? false : true
    try {
		return response.status(200).json(await Identity.instance.revokeCredentials(request.body.credential, publish, response.locals.customerId))
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  public async suspend(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }

    try {
		return response.status(200).json(await Identity.instance.suspendCredentials(request.body.credential, request.body.publish, response.locals.customerId))
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  public async reinstate(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }

    try {
		return response.status(200).json(await Identity.instance.reinstateCredentials(request.body.credential, request.body.publish, response.locals.customerId))
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  public async verifyPresentation(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }

    try {
        const result = await Identity.instance.verifyPresentation(request.body.presentation, request.body.statusOptions, response.locals.customerId)
        if (result.error) {
            return response.status(400).json({
                verified: result.verified,
                error: result.error
            })
        }
		return response.status(200).json(result)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }
}
