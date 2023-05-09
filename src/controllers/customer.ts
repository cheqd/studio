import type { Request, Response } from 'express'

import { CustomerService } from '../services/customer'
import { Identity } from '../services/identity'

export class CustomerController {

    public async create(request: Request, response: Response) {
        try {
            const kid = (await Identity.instance.createKey('Secp256k1')).kid
            const customer = await CustomerService.instance.create(response.locals.customerId, kid)
            return response.status(200).json(customer)
        } catch (error) {
            return response.status(500).json({
                Error: `Error creating customer ${error}`
            })
        }
    }

    public async update(request: Request, response: Response) {
        try {
            const result = await CustomerService.instance.update(response.locals.customerId, request.body)
            return response.status(200).json(result)
        } catch (error) {
            return response.status(500).json({
                Error: error
            })
        }
    }

    public async get(request: Request, response: Response) {
        try {
            const result = await CustomerService.instance.get(response.locals.customerId)
            if(result && !Array.isArray(result)) {
                const { account, ...res } = result
                return response.status(200).json(res)
            }

            return response.status(400).json({
                error: 'Customer not found'
            })
        } catch (error) {
            return response.status(500).json({
                Error: error
            })
        }
    }
}