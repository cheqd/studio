import type { Request, Response } from 'express'

import { CustomerService } from '../services/customer.js'
import { LogToHelper } from '../middleware/auth/logto.js'
import { FaucetHelper } from '../helpers/faucet.js'

export class AccountController {

    /**
     * @openapi
     * 
     * /account:
     *   post:
     *     tags: [Account]
     *     summary: Create a new custodian-mode client.
     *     description: This endpoint creates a new custodian-mode client and creates issuer DIDs and Cosmos/cheqd accounts for the client.
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema: 
     *               $ref: '#/components/schemas/Customer'
     *       400:
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */
    public async create(request: Request, response: Response) {
        try {
            const customer = await CustomerService.instance.create(response.locals.customerId)
            if(!customer) {
                return response.status(400).json({
                    error: `Error creating customer. Please try again`
                })
            }
            // Send some tokens for testnet
            if (process.env.FAUCET_ENABLED === 'true') {
                const resp = await FaucetHelper.delegateTokens(customer.address)
                if (resp.status !== 200) {
                    return response.status(resp.status).json({
                        error: resp.error})
                }
            }
            return response.status(200).json({
                customerId: customer.customerId,
                address: customer.address,
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
     *     summary: Fetch custodian-mode client details.
     *     description: This endpoint returns the custodian-mode client details for authenticated users.
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema: 
     *               $ref: '#/components/schemas/Customer'
     *       400:
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
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
            const { body } = request
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
