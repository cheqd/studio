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
    check('policies').optional().isObject().withMessage('Verification policies should be an object'),
    query('verifyStatus').optional().isBoolean().withMessage('verifyStatus should be a boolean value'),
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
    check('verifierDid').optional().isString().withMessage('Invalid verifier DID'),
    check('policies').optional().isObject().withMessage('Verification policies should be an object'),
    query('verifyStatus').optional().isBoolean().withMessage('verifyStatus should be a boolean value')
  ]

  /**
   * @openapi
   * 
   * /credential/issue:
   *   post:
   *     tags: [ Credential ]
   *     summary: Issue a credential.
   *     description: This endpoint issues a credential. As input it takes the list of attributes, subjectDid, context and expiration date of the credential to be issued.
   *     security: [ bearerAuth: [] ]
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/Credential'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
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

  /**
   * @openapi
   * 
   * /credential/verify:
   *   post:
   *     tags: [ Credential ]
   *     summary: Verify a credential.
   *     description: This endpoint verifies the credential. As input it takes the entire credential itself or just the JWT string.
   *     operationId: verify
   *     security: [ bearerAuth: [] ]
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/CredentialVerifyRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CredentialVerifyRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/IVerifyResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async verify(request: Request, response: Response) {
    if (request?.headers && (!request.headers['content-type'] || request.headers['content-type'] != 'application/json')) {
        return response.status(405).json({ error: 'Unsupported media type.' })
    }

    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }

    const { credential, policies } = request.body
    const verifyStatus = request.query.verifyStatus === 'true' ? true : false 
    try {
        const result = await Identity.instance.verifyCredential(
            credential, 
            {
                verifyStatus,
                policies
            },
            response.locals.customerId
        )
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

  /**
   * @openapi
   * 
   * /credential/revoke:
   *   post:
   *     tags: [ Credential ]
   *     summary: Revoke a credential.
   *     description: This endpoint verifies the credential. As input it takes the entire credential itself or just the JWT string.
   *     operationId: revoke
   *     security: [ bearerAuth: [] ]
   *     parameters:
   *       - in: query
   *         name: publish
   *         required: true
   *         schema:
   *           type: boolean
   *           default: true
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRevokeRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRevokeRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/RevocationResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
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

  /**
   * @openapi
   * 
   * /credential/suspend:
   *   post:
   *     tags: [ Credential ]
   *     summary: Suspend a credential.
   *     description: This endpoint suspends the credential. As input it takes the entire credential itself.
   *     operationId: suspend
   *     security: [ bearerAuth: [] ]
   *     parameters:
   *       - in: query
   *         name: publish
   *         schema:
   *           type: boolean
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRevokeRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRevokeRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/SuspensionResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
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

  /**
   * @openapi
   * 
   * /credential/reinstate:
   *   post:
   *     tags: [ Credential ]
   *     summary: Reinstate a credential.
   *     description: This endpoint reinstates the credential. As input it takes the entire credential itself.
   *     operationId: reinstate
   *     security: [ bearerAuth: [] ]
   *     parameters:
   *       - in: query
   *         name: publish
   *         schema:
   *           type: boolean
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRevokeRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CredentialRevokeRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/UnSuspensionResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
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
  
  /**
   * @openapi
   * 
   * /presentation/verify:
   *   post:
   *     tags: [ Presentation ]
   *     summary: Verify a credential presentation.
   *     description: This endpoint verifies the credential presentation. As input it takes the entire presentation itself.
   *     operationId: presentation
   *     security: [ bearerAuth: [] ]
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/PresentationRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/PresentationRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/IVerifyResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async verifyPresentation(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
    }

    const { presentation, verifierDid, policies } = request.body
    const verifyStatus = request.query.verifyStatus === 'true' ? true : false 
    try {
        const result = await Identity.instance.verifyPresentation(
            presentation, 
            {
                verifyStatus,
                policies,
                domain: verifierDid
            }, 
            response.locals.customerId
        )
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
