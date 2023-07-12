import type { Request, Response } from 'express'

import { CustomerService } from '../services/customer.js'
import { LogToHelper } from '../middleware/auth/logto.js'

export class CustomerController {

    /**
     * @openapi
     * 
     * /account:
     *   post:
     *     tags: [Account]
     *     summary: Create a client.
     *     description: This endpoint verifies the JWT token and creates a customer if they don't exist.
     *     security: [ bearerAuth: [] ]
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema: 
     *               $ref: '#/components/schemas/Customer'
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

    /**
     * @openapi
     * 
     * /account:
     *   get:
     *     tags: [Account]
     *     summary: Fetch a client.
     *     description: This endpoint verifies the JWT token and returns the customer if it exists.
     *     security: [ bearerAuth: [] ]
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema: 
     *               $ref: '#/components/schemas/Customer'
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

    public async setupDefaultRole(request: Request, response: Response) {
        if (request.body) {
            const body = JSON.parse(request.body)
            if (!body.user.isSuspended) {
                const logToHelper = new LogToHelper()
                await logToHelper.setup()
                const resp = await logToHelper.setDefaultRoleForUser(body.user.id as string)
                if (resp) {
                    return response.status(resp.status).json({
                        error: resp.error})
                }
                return response.status(500).json({})
            }
        }
        return response.status(400).json({})
    }
}
