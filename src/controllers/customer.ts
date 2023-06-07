import type { Request, Response } from 'express'

import { CustomerService } from '../services/customer.js'

export class CustomerController {

    public async create(request: Request, response: Response) {
        try {
            const customer = await CustomerService.instance.create(response.locals.customerId)
            if(!customer) {
                return response.status(400).json({
                    error: `Error creating customer. Please try again`
                })
            }
            return response.status(200).json({
                customerId: customer.customerId,
            })
        } catch (error) {
            return response.status(500).json({
                error: `Error creating customer ${error}`
            })
        }
    }

    public async update(request: Request, response: Response) {
        try {
            const result = await CustomerService.instance.update(response.locals.customerId, request.body)
            return response.status(200).json(result)
        } catch (error) {
            return response.status(500).json({
                error: `${error}`
            })
        }
    }

    public async get(request: Request, response: Response) {
        try {
            const result = await CustomerService.instance.get(response.locals.customerId)
            if(result && !Array.isArray(result)) {
                return response.status(200).json({
                    customerId: result.customerId,
                    address: result.address
                })
            }

            return response.status(400).json({
                error: 'Customer not found'
            })
        } catch (error) {
            return response.status(500).json({
                error: `${error}`
            })
        }
    }
}