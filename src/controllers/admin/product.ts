import type { Stripe } from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type {
	ProductGetResponseBody,
	ProductGetUnsuccessfulResponseBody,
	ProductListResponseBody,
	ProductListUnsuccessfulResponseBody,
	ProductWithPrices,
} from '../../types/admin.js';
import { StatusCodes } from 'http-status-codes';
import { check } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { DEFAULT_PAGINATION_LIST_LIMIT } from '../../types/constants.js';

dotenv.config();

export class ProductController {
	static productListValidator = [
		check('prices').optional().isBoolean().withMessage('prices should be a boolean').bail(),
		check('limit')
			.optional()
			.isInt({ min: 1, max: 100 })
			.default(DEFAULT_PAGINATION_LIST_LIMIT)
			.withMessage('limit should be between 1 and 100')
			.bail(),
		check('cursor')
			.optional()
			.isString()
			.withMessage('cursor must be an object id from a previous response')
			.bail(),
	];

	static productGetValidator = [
		check('productId').exists().withMessage('productId was not provided').bail(),
		check('prices').optional().isBoolean().withMessage('prices should be a boolean').bail(),
	];

	/**
	 * @openapi
	 *
	 * /admin/product/list:
	 *  get:
	 *    summary: Get a list of products
	 *    description: Get a list of products which are on a Stripe side
	 *    tags: [Product]
	 *    parameters:
	 *     - in: query
	 *       name: prices
	 *       schema:
	 *         type: boolean
	 *         description: If setup to true - returns the list of products with prices inside. Default - true
	 *     - in: query
	 *       name: limit
	 *       schema:
	 *         type: integer
	 *         minimum: 1
	 *         maximum: 100
	 *         description: Restrict the response to only include items from 1 to 100. Default - 10
	 *     - in: query
	 *       name: cursor
	 *       schema:
	 *         type: string
	 *         description: Cursor for pagination, this only goes forward, i.e., Stripe's equivalent of 'starting_after'
	 *    responses:
	 *      200:
	 *        description: A list of products
	 *        content:
	 *          application/json:
	 *            schema:
	 *              $ref: '#/components/schemas/ProductListResponseBody'
	 *      400:
	 *        $ref: '#/components/schemas/InvalidRequest'
	 *      401:
	 *        $ref: '#/components/schemas/UnauthorizedError'
	 *      500:
	 *        $ref: '#/components/schemas/InternalError'
	 *      404:
	 *        $ref: '#/components/schemas/NotFoundError'
	 */
	@validate
	async listProducts(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		// Get query parameters
		const prices = request.query.prices === 'false' ? false : true;
		const limit = Number(request.query.limit) || DEFAULT_PAGINATION_LIST_LIMIT;
		const cursor = request.query.cursor as string | undefined;

		try {
			const products = (await stripe.products.list({
				active: true,
				limit,
				starting_after: cursor,
			})) as Stripe.ApiList<ProductWithPrices>;

			// If no products found return 404
			if (!products.data) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: 'Seems like there no any active products on Stripe side. Please add some.',
				} satisfies ProductListUnsuccessfulResponseBody);
			}

			if (prices) {
				const responses = await Promise.all(
					products.data.map((p) => stripe.prices.list({ product: p.id, active: true }))
				);

				responses.forEach((r, i) => {
					products.data[i].prices = r.data;
				});
			}

			return response.status(StatusCodes.OK).json({ products } satisfies ProductListResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies ProductListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/product/get/{productId}:
	 *  get:
	 *    summary: Get a product
	 *    description: Get a product by id
	 *    tags: [Product]
	 *    parameters:
	 *     - in: path
	 *       name: productId
	 *       schema:
	 *         type: string
	 *         description: The product id which identifies the product in Stripe
	 *       required: true
	 *     - in: query
	 *       name: prices
	 *       schema:
	 *         type: boolean
	 *         description: If setup to true - returns the product with prices inside. Default - true
	 *    responses:
	 *      200:
	 *        description: A product
	 *        content:
	 *          application/json:
	 *            schema:
	 *              $ref: '#/components/schemas/ProductGetResponseBody'
	 *      400:
	 *        $ref: '#/components/schemas/InvalidRequest'
	 *      401:
	 *        $ref: '#/components/schemas/UnauthorizedError'
	 *      500:
	 *        $ref: '#/components/schemas/InternalError'
	 *      404:
	 *        $ref: '#/components/schemas/NotFoundError'
	 */
	@validate
	async getProduct(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		// Get query parameters
		const prices = request.query.prices === 'false' ? false : true;
		const productId = request.params.productId as string;

		try {
			// Get the product
			const product = (await stripe.products.retrieve(productId)) as ProductWithPrices;

			if (prices) {
				const prices = await stripe.prices.list({
					product: product.id,
					active: true,
				});
				if (prices.data) {
					product.prices = prices.data;
				}
			}

			return response.status(StatusCodes.OK).json({
				product: product,
			} satisfies ProductGetResponseBody);
		} catch (error) {
			// define error
			const errorRef = error as Record<string, unknown>;

			if (errorRef?.statusCode === StatusCodes.NOT_FOUND) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Product with id ${productId} not found`,
				} satisfies ProductGetUnsuccessfulResponseBody);
			}

			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies ProductGetUnsuccessfulResponseBody);
		}
	}
}
