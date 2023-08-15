import type { Request, Response } from 'express';
import { checkBalance } from '@cheqd/sdk';
import { TESTNET_MINIMUM_BALANCE, DEFAULT_DENOM_EXPONENT } from '../types/constants.js';
import { CustomerService } from '../services/customer.js';
import { LogToHelper } from '../middleware/auth/logto.js';
import { FaucetHelper } from '../helpers/faucet.js';
import { StatusCodes } from 'http-status-codes';
import { LogToWebHook } from '../middleware/hook.js';

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
			const customer = await CustomerService.instance.create(response.locals.customerId);
			if (!customer) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Error creating customer. Please try again`,
				});
			}
			// Send some tokens for testnet
			if (process.env.ENABLE_ACCOUNT_TOPUP === 'true') {
				const resp = await FaucetHelper.delegateTokens(customer.address);
				if (resp.status !== StatusCodes.OK) {
					return response.status(resp.status).json({
						error: resp.error,
					});
				}
			}
			return response.status(StatusCodes.OK).json({
				customerId: customer.customerId,
				address: customer.address,
			});
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Error creating customer ${error}`,
			});
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
			const result = await CustomerService.instance.get(response.locals.customerId);
			if (result && !Array.isArray(result)) {
				return response.status(StatusCodes.OK).json({
					customerId: result.customerId,
					address: result.address,
				});
			}

			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'Customer not found',
			});
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

	public async setupDefaultRole(request: Request, response: Response) {
		if (request.body) {
			const { body } = request;
			if (!body.user.isSuspended) {
				const logToHelper = new LogToHelper();
				const _r = await logToHelper.setup();
				if (_r.status !== StatusCodes.OK) {
					return response.status(StatusCodes.BAD_GATEWAY).json({
						error: _r.error,
					});
				}
				const resp = await logToHelper.setDefaultRoleForUser(body.user.id as string);
				return response.status(resp.status).json({
					error: resp.error,
				});
			}
		}
		return response.status(StatusCodes.BAD_REQUEST).json({});
	}

	public async bootstrap(request: Request, response: Response) {
		// 1. Check that the customer exists
		// 1.1 If not, create it
		// 2. Get the user Roles
		// 2.1 If list of roles is empty - assign default role
		// 2.2 Create custom_data and update the userInfo (send it to the LogTo)
		// 3. Check the token balance for Testnet account
		// 3.1 If it's less then required for DID creation - assign new portion from testnet-faucet
		const customerId: string = response.locals.customerId || LogToWebHook.getCustomerId(request);
		const logToHelper = new LogToHelper();
		const _r = await logToHelper.setup();
		if (_r.status !== StatusCodes.OK) {
			return response.status(StatusCodes.BAD_GATEWAY).json({
				error: _r.error,
			});
		}
		// 1. Check that the customer exists
		let customer: any = await CustomerService.instance.get(customerId);
		if (!customer) {
			customer = await CustomerService.instance.create(customerId);
		}
		// 2. Get the user's roles
		const roles = await logToHelper.getRolesForUser(customerId);
		if (roles.status !== StatusCodes.OK) {
			return response.status(StatusCodes.BAD_GATEWAY).json({
				error: roles.error,
			});
		}

		// 2.1 If list of roles is empty and the user is not suspended - assign default role
		if (roles.data.length === 0 && !LogToWebHook.isUserSuspended(request)) {
			const _r = await logToHelper.setDefaultRoleForUser(customerId);
			if (_r.status !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: _r.error,
				});
			}
		}

		const customDataFromLogTo = await logToHelper.getCustomData(customerId);

		// 2.2 Create custom_data and update the userInfo (send it to the LogTo)
		if (Object.keys(customDataFromLogTo.data).length === 0 && customer.address) {
			const customData = {
				cosmosAccounts: {
					testnet: customer.address,
				},
			};
			const _r = await logToHelper.updateCustomData(customerId, customData);
			if (_r.status !== 200) {
				return response.status(_r.status).json({
					error: _r.error,
				});
			}
		}

		// 3. Check the token balance for Testnet account
		if (customer.address && process.env.ENABLE_ACCOUNT_TOPUP === 'true') {
			const balances = await checkBalance(customer.address, process.env.TESTNET_RPC_URL);
            const balance = balances[0];
            if (!balance || +balance.amount < (TESTNET_MINIMUM_BALANCE * Math.pow(10, DEFAULT_DENOM_EXPONENT))) {
                // 3.1 If it's less then required for DID creation - assign new portion from testnet-faucet
                const resp = await FaucetHelper.delegateTokens(customer.address);
                if (resp.status !== StatusCodes.OK) {
                    return response.status(StatusCodes.BAD_GATEWAY).json({
                        error: resp.error,
                    });
                }
            }
		}
		return response.status(StatusCodes.OK).json({});
	}
}
