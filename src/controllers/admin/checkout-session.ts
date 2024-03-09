
import Stripe from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type { CheckoutSessionCreateRequestBody, CheckoutSessionCreateUnsuccessfulResponseBody } from '../../types/portal.js';
import { check, validationResult } from '../validator/index.js';
import { StatusCodes } from 'http-status-codes';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


export class CheckoutSessionController {
    static checkoutSessionCreateValidator = [
        check('price')
            .exists()
            .withMessage('price is required')
            .bail()
            .isString()
            .withMessage('price should be a string')
            .bail(),
        check('successURL')
            .exists()
            .withMessage('successURL is required')
            .bail()
            .isString()
            .withMessage('successURL should be a string')
            .bail(),
        check('cancelURL')
            .exists()
            .withMessage('cancelURL is required')
            .bail()
            .isString()
            .withMessage('cancelURL should be a string')
            .bail(),
        check('idempotencyKey')
            .optional()
            .isString()
            .withMessage('idempotencyKey should be a string')
            .bail(),
    ];

    /**
     * @openapi
     * 
     * /admin/checkout/session/create:
     *  post:
     *    summary: Create a checkout session
     *    description: Create a checkout session
     *    tags: [Checkout]
     *    requestBody:
     *      required: true
     *      content:
     *        application/json:
     *          schema:
     *            $ref: '#/components/schemas/CheckoutSessionCreateRequestBody'
     *    responses:
     *      303:
     *        description: A redirect to Stripe prebuilt checkout page
     *      400:
     *        $ref: '#/components/schemas/InvalidRequest'
     *      401:
     *        $ref: '#/components/schemas/UnauthorizedError'
     *      500:
     *        $ref: '#/components/schemas/InternalError'
     */

    public async create(request: Request, response: Response) {
        const result = validationResult(request);
        // handle error
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies CheckoutSessionCreateUnsuccessfulResponseBody);
        }

        const { price, successURL, cancelURL, quantity, idempotencyKey } = request.body satisfies CheckoutSessionCreateRequestBody;
        try {
            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                customer: response.locals.customer.stripeCustomerId,
                line_items: [
                    {
                      price: price,
                      quantity: quantity || 1,
                    },
                ],
                success_url: successURL,
                cancel_url: cancelURL,
            }, {
                idempotencyKey
            });

            if (session.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.BAD_GATEWAY).json({
                    error: 'Checkout session was not created'
                } satisfies CheckoutSessionCreateUnsuccessfulResponseBody);
            }

            if (!session.url) {
                return response.status(StatusCodes.BAD_GATEWAY).json({
                    error: 'Checkout session URL was not provided'
                } satisfies CheckoutSessionCreateUnsuccessfulResponseBody);
            }

            return response.json({
                url: session.url as string
            })
            
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                error: `Internal error: ${(error as Error)?.message || error}`
            } satisfies CheckoutSessionCreateUnsuccessfulResponseBody);
        }
    }
}