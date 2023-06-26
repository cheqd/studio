import type { Request, Response } from 'express'
import { check, query, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'

import { Identity } from '../services/identity/index.js'
import { Veramo } from '../services/identity/agent.js'
import { ResourceMetadata } from '../types/types.js'

export class RevocationController {

    static statusListValidator = [
        check('length').isNumeric().withMessage('length should be a number'),
        check('data').optional().isString().withMessage('data should be string'),
        check('encoding').optional().isIn(['base64', 'base64url', 'hex']).withMessage('invalid encoding')
    ]

    static didValidator = [
        query('did').isString().withMessage('DID is required')
        .contains('did:cheqd:').withMessage('Provide a valid cheqd DID')
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
          let result = await Veramo.instance.resolve(`${request.query.did}?resourceType=StatusList2021&resourceMetadata=true`)
          result = result.contentStream?.linkedResourceMetadata || []
          const statusList = result
                .filter((resource: ResourceMetadata)=>resource.mediaType=='application/octet-stream' || resource.mediaType=='application/gzip')
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
