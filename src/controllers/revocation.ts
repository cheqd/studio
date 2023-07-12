import type { Request, Response } from 'express'
import { check, query, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'

import { Identity } from '../services/identity/index.js'
import { Veramo } from '../services/identity/agent.js'
import { ResourceMetadata, StatusList2021ResourceTypes } from '../types/types.js'
export class RevocationController {

    static statusListValidator = [
        check('length').optional().isNumeric().withMessage('length should be a number'),
        check('encodedList').optional().isString().withMessage('data should be string'),
        check('encoding').optional().isIn(['base64', 'base64url', 'hex']).withMessage('invalid encoding'),
        check('statusPurpose').optional().isIn(['revocation', 'suspension']).withMessage('invalid statusPurpose')
    ]

    static commonValidator = [
        check('did').isString().withMessage('DID is required')
        .contains('did:cheqd:').withMessage('Provide a valid cheqd DID'),
        query('statusPurpose').optional().isString().withMessage('statusPurpose should be a string')
        .isIn(['suspension', 'revocation']).withMessage('Invalid statuspurpose'),
        query('encrypted').optional().isBoolean().withMessage('encrypted should be a boolean value')
    ]

    static updateValidator = [
        check('indices').custom((value)=>{
            return value && (Array.isArray(value) || typeof value === 'number')
        }).withMessage('An array of indices should be provided'),
        check('statusListName').exists().withMessage('StatusListName is required').isString(),
        check('statusListVerion').optional().isString().withMessage('Invalid statusListVersion'),
        query('statusAction').exists().withMessage('StatusAction is required')
        .isIn(['revoke', 'suspend', 'reinstate']),
        query('publish').isBoolean().withMessage('publish should be a boolean value')
    ]

    static checkValidator = [
      check('index').exists().withMessage('Index is required')
      .isNumeric().withMessage('Index should be a number'),
      check('statusListName').exists().withMessage('StatusListName is required')
      .isString().withMessage('Invalid statusListName')
  ]

    /**
     * @openapi
     * 
     * /credential-status/create:
     *   post:
     *     tags: [ Credential Status ]
     *     summary: Create status list 2021.
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         required: true
     *         schema:
     *           type: boolean
     *           default: false
     *     requestBody:
     *       content:
     *         application/x-www-form-urlencoded:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusCreateRequest'
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusCreateRequest'
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CredentialStatusResult'
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
    async createStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { did, encodedList, statusListName, alsoKnownAs, statusListVersion, length, encoding } = request.body
        const { statusPurpose } = request.query as { statusPurpose: 'revocation' | 'suspension' }
        
        const data = encodedList ? fromString(encodedList, encoding) : undefined
        
        try {
          let result: any
          if (data) {
            result = await Identity.instance.broadcastStatusList2021(did, { data, name: statusListName, alsoKnownAs, version: statusListVersion }, { encoding, statusPurpose }, response.locals.customerId)
          }
          result = await Identity.instance.createStatusList2021(did, { name: statusListName, alsoKnownAs, version: statusListVersion }, { length, encoding, statusPurpose }, response.locals.customerId)
          if (result.error) {
            return response.status(400).json(result)
          }
          return response.status(200).json(result)
        } catch (error) {
          return response.status(500).json({
            error: `Internal error: ${error}`
          })
        }
    }

    /**
     * @openapi
     * 
     * /credential-status/publish:
     *   post:
     *     tags: [ Credential Status ]
     *     summary: Publish status list 2021.
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         required: true
     *         schema:
     *           type: boolean
     *           default: false
     *     requestBody:
     *       content:
     *         application/x-www-form-urlencoded:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusPublishRequest'
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusPublishRequest'
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CredentialStatusResult'
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
    async publishStatusList(request: Request, response: Response) {
      const result = validationResult(request)
      if (!result.isEmpty()) {
        return response.status(400).json({ error: result.array()[0].msg })
      }

      let { did, encodedList, statusListName, alsoKnownAs, statusListVersion, length, encoding } = request.body
      const { statusPurpose } = request.query as { statusPurpose: 'revocation' | 'suspension' }
      
      const data = encodedList ? fromString(encodedList, encoding) : undefined
      
      try {
        let result: any
        if (data) {
          result = await Identity.instance.broadcastStatusList2021(did, { data, name: statusListName, alsoKnownAs, version: statusListVersion }, { encoding, statusPurpose }, response.locals.customerId)
        }
        result = await Identity.instance.createStatusList2021(did, { name: statusListName, alsoKnownAs, version: statusListVersion }, { length, encoding, statusPurpose }, response.locals.customerId)
        if (result.error) {
          return response.status(400).json(result)
        }
        return response.status(200).json(result)
      } catch (error) {
        return response.status(500).json({
          error: `Internal error: ${error}`
        })
      }
  }

    /**
     * @openapi
     * 
     * /credential-status/search:
     *   get:
     *     tags: [ Credential Status ]
     *     summary: Fetch statusList's published by a DID.
     *     parameters:
     *       - in: query
     *         name: did
     *         required: true
     *         schema:
     *           type: string
     *       - in: query
     *         name: statusPurpose
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: statusListName
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 type: object
     *                 properties:
     *                   statusListName:
     *                     type: string
     *                   statusListVersion:
     *                     type: string
     *                   statusListId:
     *                     type: string
     *                   statusListNextVersion:
     *                     type: string
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
    async fetchStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        try {
          const statusPurpose = request.query.statusPurpose as 'revocation' | 'suspension'
          const resourceTypes =  statusPurpose ? [StatusList2021ResourceTypes[`${statusPurpose}`]] : [StatusList2021ResourceTypes.revocation, StatusList2021ResourceTypes.suspension]
          let metadata: ResourceMetadata[] = []
            
          for (const resourceType of resourceTypes) {
            const result = await Veramo.instance.resolve(`${request.query.did}?resourceType=${resourceType}&resourceMetadata=true`)
            metadata = metadata.concat(result.contentStream?.linkedResourceMetadata || [])
          }
          const statusList = metadata
                .filter((resource: ResourceMetadata)=>{
                    if (request.query.statusListName) {
                      return resource.resourceName === request.query.statusListName && resource.mediaType == 'application/json'
                    }
                    return resource.mediaType == 'application/json'
                })
                .map((resource: ResourceMetadata)=>{
                    return {
                        statusListName: resource.resourceName,
                        statusPurpose: resource.resourceType,
                        statusListVersion: resource.resourceVersion,
                        statusListId: resource.resourceId,
                        statusListNextVersion: resource.nextVersionId
                    }
                })
          return response.status(200).json(statusList) 
        } catch (error) {
          return response.status(500).json({
            error: `Internal error: ${error}`
          })
        }
    }

    /**
     * @openapi
     * 
     * /credential-status/update:
     *   post:
     *     tags: [ Credential Status ]
     *     summary: Update status list 2021.
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         required: true
     *         schema:
     *           type: boolean
     *           default: false
     *     requestBody:
     *       content:
     *         application/x-www-form-urlencoded:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusUpdateRequest'
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusUpdateRequest'
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CredentialStatusResult'
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
    async  updateStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { did, statusListName, statusListVersion, indices } = request.body
        const { statusAction } = request.query as { statusAction: 'revoke' | 'suspend' | 'reinstate' }
        const publish = request.query.publish === 'false' ? false : true
        indices = typeof indices === 'number' ? [indices] : indices

        try {
          let result: any
          result = await Identity.instance.updateStatusList2021(did, { indices, statusListName, statusListVersion, statusAction }, publish, response.locals.customerId) 
          if (result.error) {
            return response.status(400).json(result)
          }
          return response.status(200).json(result)
        } catch (error) {
          return response.status(500).json({
            error: `Internal error: ${error}`
          })
        }
    }
    
    /**
     * @openapi
     * 
     * /credential-status/check:
     *   post:
     *     tags: [ Credential Status ]
     *     summary: Check Credential Status of an index in status list 2021.
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         required: true
     *         schema:
     *           type: boolean
     *           default: false
     *     requestBody:
     *       content:
     *         application/x-www-form-urlencoded:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusCheckRequest'
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/CredentialStatusCheckRequest'
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 revoked:
     *                   type: boolean
     *                 suspended:
     *                   type: boolean
     *                   example: false
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
    async checkStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { did, statusListName, index } = request.body
        const statusPurpose = request.query.statusPurpose as 'revocation' | 'suspension'

        try {
          let result: any
          result = await Identity.instance.checkStatusList2021(did, { statusListIndex: index, statusListName, statusPurpose }, response.locals.customerId) 
          if (result.error) {
            return response.status(400).json(result)
          }
          return response.status(200).json(result)
        } catch (error) {
          return response.status(500).json({
            error: `Internal error: ${error}`
          })
        }
    }
}
