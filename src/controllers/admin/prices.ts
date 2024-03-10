import { Stripe } from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type { PriceListResponseBody, PriceListUnsuccessfulResponseBody } from '../../types/portal.js';
import { StatusCodes } from 'http-status-codes';
import { validationResult } from '../validator/index.js';
import { check } from 'express-validator';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class PriceController {
	static priceListValidator = [
		check('productId').optional().isString().withMessage('productId should be a string').bail(),
	];

	/**
	 * @openapi
	 *
	 * /admin/price/list:
	 *  get:
	 *    summary: Get a list of prices
	 *    description: Get a list of prices
	 *    tags: [Price]
	 *    parameters:
	 *     - in: query
	 *       name: productId
	 *       schema:
	 *         type: string
	 *         description: The product id. If passed - returns filtered by this product list of prices.
	 *         required: false
	 *    responses:
	 *      200:
	 *        description: A list of prices
	 *        content:
	 *          application/json:
	 *            schema:
	 *              $ref: '#/components/schemas/PriceListResponseBody'
	 *      400:
	 *        $ref: '#/components/schemas/InvalidRequest'
	 *      401:
	 *        $ref: '#/components/schemas/UnauthorizedError'
	 *      500:
	 *        $ref: '#/components/schemas/InternalError'
	 *      404:
	 *        $ref: '#/components/schemas/NotFoundError'
	 */
	async getListPrices(request: Request, response: Response) {
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array().pop()?.msg,
			} satisfies PriceListUnsuccessfulResponseBody);
		}
		// Get query parameters
		const productId = request.query.productId;

		try {
			// Fetch the list of prices
			const prices = productId
				? await stripe.prices.list({
						product: productId as string,
						active: true,
					})
				: await stripe.prices.list({
						active: true,
					});

			return response.status(StatusCodes.OK).json({
				prices: prices,
			} satisfies PriceListResponseBody);
		} catch (error) {
			return response.status(500).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies PriceListUnsuccessfulResponseBody);
		}
	}
}
