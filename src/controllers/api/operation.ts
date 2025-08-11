import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../../services/identity';
import { ListResourceOptions } from '../../types/resource';
import { query } from 'express-validator';
import { CheqdNetwork } from '@cheqd/sdk';

export class OperationController {
	public static listOperationValidator = [
		query('network')
			.optional()
			.isString()
			.isIn([CheqdNetwork.Mainnet, CheqdNetwork.Testnet])
			.withMessage('Invalid network')
			.bail(),
		query('deprecated')
			.optional()
			.isBoolean()
			.withMessage('resourceName is supposed to have type of String')
			.bail(),
		query('successful')
			.optional()
			.isBoolean()
			.withMessage('resourceType is supposed to have type of String')
			.bail(),
		query('encrypted').optional().isBoolean().withMessage('encrypted filter should be a boolean value').bail(),
	];

	/**
	 * @openapi
	 *
	 * /events:
	 *   get:
	 *     tags: [ Event ]
	 *     summary: Fetch Credential event's triggered by the user.
	 *     description: This endpoint returns the list of Credential Events controlled by the account.
	 *     parameters:
	 *       - in: query
	 *         name: network
	 *         description: Filter credential events by the network published.
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - mainnet
	 *             - testnet
	 *         required: false
	 *       - in: query
	 *         name: deprecated
	 *         description: Filter credential events by the deprecated type
	 *         schema:
	 *           type: boolean
	 *         required: false
	 *       - in: query
	 *         name: successful
	 *         description: Filter credential events by the resource name
	 *         schema:
	 *           type: string
	 *         required: false
	 *       - in: query
	 *         name: createdAt
	 *         description: Filter resource by created date
	 *         schema:
	 *           type: string
	 *           format: date
	 *         required: false
	 *       - in: query
	 *         name: page
	 *         description: Page number.
	 *         schema:
	 *           type: number
	 *         required: false
	 *       - in: query
	 *         name: limit
	 *         description: Number of items to be listed in a single page.
	 *         schema:
	 *           type: number
	 *         required: false
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/ListResourceResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async listOperations(request: Request, response: Response) {
		// Extract params, filters and pagination
		const { category, operationName, deprecated, successful, createdAt, page, limit } =
			request.params satisfies ListResourceOptions;

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.listOperations(
				{
					category,
					operationName,
					deprecated: deprecated === 'true',
					successful: successful === 'true',
					createdAt,
					page: parseInt(page),
					limit: parseInt(limit),
				},
				response.locals.customer
			);
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
