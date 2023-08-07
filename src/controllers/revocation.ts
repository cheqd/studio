import type { Request, Response } from 'express'
import { check, query, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'
import { StatusCodes } from 'http-status-codes'

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
     *     summary: Create a StatusList2021 credential status list.
     *     description: This endpoint creates a StatusList2021 credential status list. The StatusList is published as a DID-Linked Resource on ledger. As input, it can can take input parameters needed to create the status list via a form, or a pre-assembled status list in JSON format. Status lists can be created as either encrypted or unencrypted; and with purpose as either revocation or suspension.
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         description: The purpose of the status list. Can be either revocation or suspension. Once this is set, it cannot be changed. A new status list must be created to change the purpose.
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         description: Define whether the status list is encrypted. The default is `false`, which means the DID-Linked Resource can be fetched and parsed publicly. Encrypted status lists can only be fetched if the payment conditions are satisfied.
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
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */
    async createStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg })
        }

        const { did, encodedList, statusListName, alsoKnownAs, statusListVersion, length, encoding } = request.body
        const { statusPurpose } = request.query as { statusPurpose: 'revocation' | 'suspension' }
        
        const data = encodedList ? fromString(encodedList, encoding) : undefined
        
        try {
          let result: any
          if (data) {
            result = await new Identity(response.locals.customerId).agent.broadcastStatusList2021(did, { data, name: statusListName, alsoKnownAs, version: statusListVersion }, { encoding, statusPurpose }, response.locals.customerId)
          }
          result = await new Identity(response.locals.customerId).agent.createStatusList2021(did, { name: statusListName, alsoKnownAs, version: statusListVersion }, { length, encoding, statusPurpose }, response.locals.customerId)
          if (result.error) {
            return response.status(StatusCodes.BAD_REQUEST).json(result)
          }
          return response.status(StatusCodes.OK).json(result)
        } catch (error) {
          return response.status(StatusCodes. INTERNAL_SERVER_ERROR).json({
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
     *     summary: Publish a StatusList2021 credential status list.
     *     description: Published a pre-assembled StatusList2021 as a DID-Linked Resource. As input, it needs to be provided the `encodedList` property, along with the associated DID-Linked Resource properties in the original status list (if already created previously).
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         description: The purpose of the status list. Can be either revocation or suspension. Once this is set, it cannot be changed. A new status list must be created to change the purpose.
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         description: Define whether the status list is encrypted. The default is `false`, which means the DID-Linked Resource can be fetched and parsed publicly. Encrypted status lists can only be fetched if the payment conditions are satisfied. When publishing a new version, this should match the original property.
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
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */
    async publishStatusList(request: Request, response: Response) {
      const result = validationResult(request)
      if (!result.isEmpty()) {
        return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg })
      }

      const { did, encodedList, statusListName, alsoKnownAs, statusListVersion, length, encoding } = request.body
      const { statusPurpose } = request.query as { statusPurpose: 'revocation' | 'suspension' }
      
      const data = encodedList ? fromString(encodedList, encoding) : undefined
      
      try {
        let result: any
        if (data) {
          result = await new Identity(response.locals.customerId).agent.broadcastStatusList2021(did, { data, name: statusListName, alsoKnownAs, version: statusListVersion }, { encoding, statusPurpose }, response.locals.customerId)
        }
        result = await new Identity(response.locals.customerId).agent.createStatusList2021(did, { name: statusListName, alsoKnownAs, version: statusListVersion }, { length, encoding, statusPurpose }, response.locals.customerId)
        if (result.error) {
          return response.status(StatusCodes.BAD_REQUEST).json(result)
        }
        return response.status(StatusCodes.OK).json(result)
      } catch (error) {
        return response.status(StatusCodes. INTERNAL_SERVER_ERROR).json({
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
     *     summary: Fetch StatusList2021 DID-Linked Resource based on search criteria.
     *     parameters:
     *       - in: query
     *         name: did
     *         description: The DID of the issuer of the status list.
     *         required: true
     *         schema:
     *           type: string
     *       - in: query
     *         name: statusPurpose
     *         description: The purpose of the status list. Can be either revocation or suspension.
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: statusListName
     *         description: The name of the StatusList2021 DID-Linked Resource.
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
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */  
    async fetchStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg })
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
          return response.status(StatusCodes.OK).json(statusList) 
        } catch (error) {
          return response.status(StatusCodes. INTERNAL_SERVER_ERROR).json({
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
     *     summary: Update an existing StatusList2021 credential status list.
     *     parameters:
     *       - in: query
     *         name: statusAction
     *         description: The update action to be performed on the statuslist, can be revoke, suspend or reinstate
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revoke
     *             - suspend
     *             - reinstate
     *       - in: query
     *         name: encrypted
     *         description: Define whether the status list is encrypted. The default is `false`, which means the DID-Linked Resource can be fetched and parsed publicly. Encrypted status lists can only be fetched if the payment conditions are satisfied. When publishing a new version, this should match the original property.
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
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */
    async  updateStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg })
        }

        let { did, statusListName, statusListVersion, indices } = request.body
        const { statusAction } = request.query as { statusAction: 'revoke' | 'suspend' | 'reinstate' }
        const publish = request.query.publish === 'false' ? false : true
        indices = typeof indices === 'number' ? [indices] : indices

        try {
          const result = await new Identity(response.locals.customerId).agent.updateStatusList2021(did, { indices, statusListName, statusListVersion, statusAction }, publish, response.locals.customerId) 
          if (result.error) {
            return response.status(StatusCodes.BAD_REQUEST).json(result)
          }
          return response.status(StatusCodes.OK).json(result)
        } catch (error) {
          return response.status(StatusCodes. INTERNAL_SERVER_ERROR).json({
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
     *     summary: Check a StatusList2021 index for a given Verifiable Credential.
     *     description: This endpoint checks a StatusList2021 index for a given Verifiable Credential and reports whether it is revoked or suspended. It offers a standalone method for checking an index without passing the entire Verifiable Credential or Verifiable Presentation.
     *     parameters:
     *       - in: query
     *         name: statusPurpose
     *         description: The purpose of the status list. Can be either revocation or suspension.
     *         required: true
     *         schema:
     *           type: string
     *           enum:
     *             - revocation
     *             - suspension
     *       - in: query
     *         name: encrypted
     *         description: Define whether the status list is encrypted. The default is `false`, which means the DID-Linked Resource can be fetched and parsed publicly. Encrypted status lists can only be fetched if the payment conditions are satisfied.
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
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */
    async checkStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg })
        }

        let { did, statusListName, index } = request.body
        const statusPurpose = request.query.statusPurpose as 'revocation' | 'suspension'

        try {
          const result = await new Identity(response.locals.customerId).agent.checkStatusList2021(
              did, 
              { statusListIndex: index, statusListName, statusPurpose },
              response.locals.customerId)

          if (result.error) {
            return response.status(StatusCodes.BAD_REQUEST).json(result)
          }
          return response.status(StatusCodes.OK).json(result)
        } catch (error) {
          return response.status(StatusCodes. INTERNAL_SERVER_ERROR).json({
            error: `Internal error: ${error}`
          })
        }
    }
}
