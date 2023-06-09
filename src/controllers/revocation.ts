import type { Request, Response } from 'express'
import { check, query, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'

import { Identity } from '../services/identity/index.js'

export class RevocationController {

    static statusListValidator = [
        check('length').isNumeric().withMessage('length should be a number'),
        check('data').optional().isString().withMessage('data should be string'),
        check('encoding').optional().isIn(['base64', 'base64url', 'hex']).withMessage('invalid encoding'),
        query('did').isString().withMessage('DID is required')
    ]

    async createStatusList(request: Request, response: Response) {
        const result = validationResult(request)
        if (!result.isEmpty()) {
          return response.status(400).json({ error: result.array()[0].msg })
        }

        let { length, encoding } = request.body
        let { data, name, type, alsoKnownAs, version, network } = request.body
        
        const did = request.query.did as string
        network = network || (did.split(':'))[2]
        data = data ? fromString(data, 'base64') : undefined
        
        try {
          const result = await Identity.instance.createStatusList2021(did, network, { data, name, alsoKnownAs, version, resourceType: type }, { length, encoding }, response.locals.customerId)
          return response.status(200).json({
            success: result
          })
        } catch (error) {
          return response.status(500).json({
            error: `Internal error: ${error}`
          })
        }
    }
}
