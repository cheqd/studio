import type { Request, Response } from 'express'
import type { VerifiableCredential } from '@veramo/core'

import { check, query, validationResult } from 'express-validator'

import { Credentials } from '../services/credentials.js'
import { Identity } from '../services/identity/index.js'

/**
 * @openapi
 * 
 * components:
 *   schemas:
 *     CredentialRequest:
 *       description: Input fields for the create operation.
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         issuerDid:
 *           description: This input field is the Issuer's DID.
 *           type: string
 *           example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         subjectDid:
 *           description: This input field is the holder's DID.
 *           type: string
 *           example: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *         attributes:
 *           description: Json input of the attributes.
 *           type: object
 *           example:
 *             gender: male
 *             name: bob
 *         '@context':
 *           description: Additional contexts to be included in the credential.
 *           type: array
 *           items:
 *             type: string
 *           example: 
 *             - https://schema.org
 *         type:
 *           description: Additional type property to be included in the credential.
 *           type: array
 *           items:
 *             type: string
 *           example:
 *             - Person
 *         expirationDate:
 *           description: Optional expiration date according to the https://www.w3.org/TR/vc-data-model/#expiration specification.
 *         format:
 *           description: Select one of the supported credential formats, jwt by default.
 *           type: string
 *           enum:
 *             - jwt
 *             - lds
 *           example: jwt
 *         credentialStatus:
 *           description: Optional field to support revocation or suspension, which takes statusListName and statusListPurpose as inputs.
 *           type: object
 *           required:
 *             - statusPurpose
 *             - statusListName
 *           properties:
 *             statusPurpose:
 *               type: string
 *               enum:
 *                 - revocation
 *                 - suspension
 *               example: revocation
 *             statusListName:
 *               type: string
 *               example: employee-credentials
 *             statusListIndex:
 *               type: number
 *               example: 10
 *             statusListVersion:
 *               type: string
 *             statusListRangeStart:
 *               type: number
 *             statusListRangeEnd:
 *               type: number
 *             indexNotIn:
 *               type: number
 *       required: [issuerDid, subjectDid, attributes]
 *     Credential:
 *       description: Input fields for the update operation.
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         '@context':
 *           type: array
 *           items:
 *             type: string
 *           example:
 *             - https://www.w3.org/2018/credentials/v1
 *             - https://schema.org
 *             - https://veramo.io/contexts/profile/v1
 *         type:
 *           type: array
 *           items:
 *             type: string
 *           example:
 *             - VerifiableCredential
 *             - Person
 *         expirationDate:
 *           type: string
 *         issuer:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         credentialSubject:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *           example:
 *             gender: male
 *             id: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *             name: Bob
 *         credentialStatus:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20
 *             statusListIndex:
 *               type: string
 *               example: 20
 *             statusPurpose:
 *               type: string
 *               enum:
 *                 - revocation
 *                 - suspension
 *               example: suspension
 *             type:
 *               type: string
 *               enum:
 *                 - StatusList2021Entry
 *               example: StatusList2021Entry
 *         issuanceDate:
 *           type: string
 *           example: 2023-06-08T13:49:28.000Z
 *         proof:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               example: JwtProof2020
 *             jwt:
 *               type: string
 *               example: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo3YmY4MWEyMC02MzNjLTRjYzctYmM0YS01YTQ1ODAxMDA1ZTAiLCJuYmYiOjE2ODYyMzIxNjgsInN1YiI6ImRpZDprZXk6ejZNa2hhWGdCWkR2b3REa0w1MjU3ZmFpenRpR2lDMlF0S0xHcGJubkVHdGEyZG9LIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3NjaGVtYS5vcmciLCJodHRwczovL3ZlcmFtby5pby9jb250ZXh0cy9wcm9maWxlL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImdlbmRlciI6Im1hbGUiLCJuYW1lIjoiQm9iIn0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJQZXJzb24iXX19.wMfdR6RtyAZA4eoWya5Aw97wwER2Cm5Guk780Xw8H9fA3sfudIJeLRLboqixpTchqSbYeA7KbuCTAnLgXTD_Cg
 *     CredentialRevokeRequest:
 *       type: object
 *       properties:
 *         credential:
 *           description: This input field takes the credential object or the JWT string
 *           oneOf:
 *             - type: object
 *             - type: string
 *     RevocationResult:
 *       properties:
 *         revoked:
 *           type: boolean
 *     SuspensionResult:
 *       properties:
 *         suspended:
 *           type: boolean
 *         statusList:
 *           type: string
 *     UnSuspensionResult:
 *       properties:
 *         unsuspended:
 *           type: boolean
 *         statusList:
 *           type: string
 *     CredentialVerifyRequest:
 *       type: object
 *       properties:
 *         credential:
 *           description: This input field takes the credential object or the JWT string.\
 *           allOf:
 *             - type: object
 *             - type: string
 *     IVerifyResult:
 *       type: object
 *       properties:
 *         verified:
 *           type: boolean
 *           example: true
 *         issuer:
 *           type: string
 *           example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         signer:
 *           type: object
 *           example:
 *             controller: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *             id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *             publicKeyBase58: BTJiso1S4iSiReP6wGksSneGfiKHxz9SYcm2KknpqBJt
 *             type: Ed25519VerificationKey2018
 *         jwt:
 *           type: string
 *         verifiableCredential:
 *           type: object
 *     PresentationRequest:
 *       type: object
 *       required:
 *         - presentation
 *       properties:
 *         presentation:
 *           description: This input field takes the presentation object or the JWT string.
 *           allOf:
 *             - type: string
 *             - type: object
 */

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
