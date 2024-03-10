import { Stripe } from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type { ProductGetResponseBody, ProductGetUnsuccessfulResponseBody, ProductListResponseBody, ProductListUnsuccessfulResponseBody, ProductWithPrices } from '../../types/portal.js';
import { StatusCodes } from 'http-status-codes';
import { validationResult } from '../validator/index.js';
import { check } from 'express-validator';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class ProductController {

    static productListValidator = [
        check('prices')
            .optional()
            .isBoolean()
            .withMessage('prices should be a boolean')
            .bail(),
    ];

    static productGetValidator = [
        check('productId')
            .exists()
            .withMessage('productId was not provided')
            .bail(),
        check('prices')
            .optional()
            .isBoolean()
            .withMessage('prices should be a boolean')
            .bail(),
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
     *         required: false
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
    async listProducts(request: Request, response: Response) {
        const result = validationResult(request);
        // handle error
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies ProductListUnsuccessfulResponseBody);
        }
        // Get query parameters
        const prices = request.query.prices === 'false' ? false : true;

        try {
            const products = await stripe.products.list({
                active: true,
            }) as Stripe.ApiList<ProductWithPrices>;

            // If no products found return 404
            if (!products.data) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: 'Seems like there no any active products on Stripe side. Please add some.'
                } satisfies ProductListUnsuccessfulResponseBody);
            }

            if (prices) {
                for (const product of products.data) {
                    const prices = await stripe.prices.list({
                        product: product.id,
                        active: true,
                    });
                    product.prices = prices.data;
                }
            }

            return response.status(StatusCodes.OK).json({
                products: products
            } satisfies ProductListResponseBody);
        } catch (error) {
            return response.status(500).json({
                error: `Internal error: ${(error as Error)?.message || error}`
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
     *         required: true
     *     - in: query
     *       name: prices
     *       schema:
     *         type: boolean
     *         description: If setup to true - returns the product with prices inside. Default - true
     *         required: false
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
    async getProduct(request: Request, response: Response) {
        const result = validationResult(request);
        // handle error
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies ProductGetUnsuccessfulResponseBody);
        }
        // Get query parameters
        const prices = request.query.prices === 'false' ? false : true;
        const productId = request.params.productId as string;

        try {
            // Get the product
            const product = await stripe.products.retrieve(productId) as ProductWithPrices;

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
                product: product
            } satisfies ProductGetResponseBody);
        } catch (error) {

            // define error
			const errorRef = error as Record<string, unknown>;

            if (errorRef?.statusCode === StatusCodes.NOT_FOUND) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Product with id ${productId} not found`
                } satisfies ProductGetUnsuccessfulResponseBody);
            }

            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                error: `Internal error: ${(error as Error)?.message || error}`
            } satisfies ProductGetUnsuccessfulResponseBody);
        }
    }
}