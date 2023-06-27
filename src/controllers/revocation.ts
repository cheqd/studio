import type { Request, Response } from 'express'
import { check, param, query, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'

import { Identity } from '../services/identity/index.js'
import { Veramo } from '../services/identity/agent.js'
import { ResourceMetadata, StatusList2021ResourceTypes } from '../types/types.js'

export class RevocationController {

    static statusListValidator = [
        check('length').isNumeric().withMessage('length should be a number'),
        check('data').optional().isString().withMessage('data should be string'),
        check('encoding').optional().isIn(['base64', 'base64url', 'hex']).withMessage('invalid encoding'),
        check('statusPurpose').optional().isIn(['revocation', 'suspension']).withMessage('invalid statusPurpose')
    ]

    static paramValidator = [
        param('did').isString().withMessage('DID is required')
        .contains('did:cheqd:').withMessage('Provide a valid cheqd DID'),
        query('statusPurpose').optional().isString().withMessage('statusPurpose should be a string')
        .isIn(['suspension', 'revocation']).withMessage('Invalid statuspurpose'),
        query('encrypted').optional().isBoolean().withMessage('encrypted should be a boolean value')
    ]

    async createStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { length, encoding } = request.body
        let { data, name, statusPurpose, alsoKnownAs, version } = request.body
        
        const did = request.query.did as string
        data = data ? fromString(data, 'base64') : undefined
        
        try {
          let result: any
          if (data) {
            result = await Identity.instance.broadcastStatusList2021(did, { data, name, alsoKnownAs, version }, { encoding, statusPurpose }, response.locals.customerId)
          }
          result = await Identity.instance.createStatusList2021(did, { name, alsoKnownAs, version }, { length, encoding, statusPurpose }, response.locals.customerId)
          return response.status(200).json({
            success: result
          })
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
          const resourceTypes = request.query.resourceType ? [request.query.resourceType] : [StatusList2021ResourceTypes.revocation, StatusList2021ResourceTypes.suspension];
          let metadata: ResourceMetadata[] = [];
            
          for (const resourceType of resourceTypes) {
            const result = await Veramo.instance.resolve(`${request.query.did}?resourceType=${resourceType}&resourceMetadata=true`);
            metadata = metadata.concat(result.contentStream?.linkedResourceMetadata || []);
          }
          const statusList = metadata
                .filter((resource: ResourceMetadata)=>resource.mediaType=='application/json')
                .map((resource: ResourceMetadata)=>{
                    return {
                        statusListName: resource.resourceName,
                        statusListVersion: resource.resourceVersion,
                        mediaType: resource.mediaType,
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
}
