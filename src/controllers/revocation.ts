import type { Request, Response } from 'express'
import { check, query, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'

import { Identity } from '../services/identity/index.js'
import { Veramo } from '../services/identity/agent.js'
import { ResourceMetadata, StatusList2021ResourceTypes } from '../types/types.js'

export class RevocationController {

    static statusListValidator = [
        check('length').optional().isNumeric().withMessage('length should be a number'),
        check('data').optional().isString().withMessage('data should be string'),
        check('encoding').optional().isIn(['base64', 'base64url', 'hex']).withMessage('invalid encoding'),
        check('statusPurpose').optional().isIn(['revocation', 'suspension']).withMessage('invalid statusPurpose')
    ]

    static queryValidator = [
        check('did').isString().withMessage('DID is required')
        .contains('did:cheqd:').withMessage('Provide a valid cheqd DID'),
        query('statusPurpose').optional().isString().withMessage('statusPurpose should be a string')
        .isIn(['suspension', 'revocation']).withMessage('Invalid statuspurpose'),
        query('encrypted').optional().isBoolean().withMessage('encrypted should be a boolean value')
    ]

    static updateValidator = [
        check('index').optional().isNumeric().withMessage('index should be a number'),
        check('indices').custom((value, {req})=>{
            if(value) {
                return Array.isArray(value)
            } else {
                return req.body.index
            }
        }).withMessage('Either an index or an array of indices should be provided'),
        check('statusListName').exists().withMessage('StatusListName is required').isString(),
        check('statusListVerion').optional().isString().withMessage('Invalid statusListVersion'),
        query('statusAction').exists().withMessage('StatusAction is required')
        .isIn(['revoke', 'suspend', 'reinstate']),
        query('publish').isBoolean().withMessage('publish should be a boolean value')
    ]

    async createStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { did, data, name, alsoKnownAs, version, length, encoding } = request.body
        const { statusPurpose } = request.query as { statusPurpose: 'revocation' | 'suspension' }
        
        data = data ? fromString(data, encoding) : undefined
        
        try {
          let result: any
          if (data) {
            result = await Identity.instance.broadcastStatusList2021(did, { data, name, alsoKnownAs, version }, { encoding, statusPurpose }, response.locals.customerId)
          }
          result = await Identity.instance.createStatusList2021(did, { name, alsoKnownAs, version }, { length, encoding, statusPurpose }, response.locals.customerId)
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

    async  updateStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { did, statusListName, statusListVersion, index, indices } = request.body
        const { statusAction } = request.query as { statusAction: 'revoke' | 'suspend' | 'reinstate' }
        const publish = request.query.publish === 'false' ? false : true
        try {
          let result: any
          result = await Identity.instance.updateStatusList2021(did, { indices: indices || [index], statusListName, statusListVersion, statusAction }, publish, response.locals.customerId) 
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
