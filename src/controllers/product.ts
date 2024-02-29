import { Stripe } from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type { ProductGetResponseBody, ProductGetUnsuccessfulResponseBody, ProductListResponseBody, ProductListUnsuccessfulResponseBody, ProductWithPrices } from '../types/portal.js';
import { StatusCodes } from 'http-status-codes';
import { validationResult } from './validator/index.js';
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

    async getListProducts(request: Request, response: Response) {
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

            // If no product found return 404
            if (!product) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: 'No product found with id: ' + productId
                } satisfies ProductGetUnsuccessfulResponseBody);
            }

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
            return response.status(500).json({
                error: `Internal error: ${(error as Error)?.message || error}`
            } satisfies ProductGetUnsuccessfulResponseBody);
        }
    }
}