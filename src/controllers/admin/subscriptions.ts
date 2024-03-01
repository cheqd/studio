import { Stripe } from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type { SubscriptionCreateRequestBody, SubscriptionCreateResponseBody, SubscriptionCreateUnsuccessfulResponseBody, SubscriptionCancelResponseBody, SubscriptionCancelUnsuccessfulResponseBody, SubscriptionGetResponseBody, SubscriptionGetUnsuccessfulResponseBody, SubscriptionListResponseBody, SubscriptionListUnsuccessfulResponseBody, SubscriptionUpdateRequestBody, SubscriptionUpdateResponseBody, SubscriptionUpdateUnsuccessfulResponseBody, SubscriptionResumeUnsuccessfulResponseBody, SubscriptionResumeResponseBody, SubscriptionResumeRequestBody, SubscriptionCancelRequestBody } from '../../types/portal.js';
import { StatusCodes } from 'http-status-codes';
import { validationResult } from '../validator/index.js';
import { check } from 'express-validator';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class SubscriptionController {

    static subscriptionCreateValidator = [
        check('customerId')
            .exists()
            .withMessage('customerId was not provided')
            .bail(),
        check('items')
            .exists()
            .withMessage('items was not provided')
            .bail()
            .isArray()
            .withMessage('items should be an array')
            .bail(),
        check('items.*.price')
            .exists()
            .withMessage('price was not provided')
            .bail()
            .isString()
            .withMessage('price should be a string')
            .bail(),
        check('idempotencyKey')
            .optional()
            .isString()
            .withMessage('idempotencyKey should be a string')
            .bail(),
    ];

    static subscriptionUpdateValidator = [
        check('subscriptionId')
            .exists()
            .withMessage('subscriptionId was not provided')
            .bail(),
        check('updateParams')
            .exists()
            .withMessage('updateParams was not provided')
            .bail(),
        check('idempotencyKey')
            .optional()
            .isString()
            .withMessage('idempotencyKey should be a string')
            .bail(),
    ];

    static subscriptionGetValidator = [
        check('subscriptionId')
            .exists()
            .withMessage('subscriptionId was not provided')
            .bail()
            .isString()
            .withMessage('subscriptionId should be a string')
            .bail(),
    ];

    static subscriptionListValidator = [
        check('customerId')
            .optional()
            .isString()
            .withMessage('customerId should be a string')
            .bail(),
    ];

    static subscriptionCancelValidator = [
        check('subscriptionId')
            .exists()
            .withMessage('subscriptionId was not provided')
            .bail()
            .isString()
            .withMessage('subscriptionId should be a string')
            .bail(),
        check('idempotencyKey')
            .optional()
            .isString()
            .withMessage('idempotencyKey should be a string')
            .bail(),
    ];

    static subscriptionResumeValidator = [
        check('subscriptionId')
            .exists()
            .withMessage('subscriptionId was not provided')
            .bail()
            .isString()
            .withMessage('subscriptionId should be a string')
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
     * /admin/subscription/create:
     *   post:
     *     summary: Create a subscription
     *     description: Creates a new subscription for an existing customer
     *     tags: [Subscription]
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/SubscriptionCreateRequestBody'
     *     responses:
	 *       201:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SubscriptionCreateResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
     */
    async create(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({
                error: result.array().pop()?.msg 
            } satisfies SubscriptionCreateUnsuccessfulResponseBody);
        }

        const { customerId, items, idempotencyKey } = request.body satisfies SubscriptionCreateRequestBody;
        try {
            // Create the subscription
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: items,
            },
            {
                idempotencyKey: idempotencyKey,
            });
            if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Subscription was not created`,
                } satisfies SubscriptionCreateUnsuccessfulResponseBody);
            }
            return response.status(StatusCodes.CREATED).json({
                subscription: subscription
            } satisfies SubscriptionCreateResponseBody );
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionCreateUnsuccessfulResponseBody);
        }
    }

    /**
     * @openapi
     * 
     * /admin/subscription/update:
     *   post:
     *     summary: Update a subscription
     *     description: Updates an existing subscription
     *     tags: [Subscription]
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/SubscriptionUpdateRequestBody'
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SubscriptionUpdateResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
     */
    async update(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies SubscriptionUpdateUnsuccessfulResponseBody);
        }

        const { subscriptionId, updateParams, idempotencyKey} = request.body satisfies SubscriptionUpdateRequestBody;
        try {
            // Update the subscription
            const subscription = await stripe.subscriptions.update(
                subscriptionId,
                updateParams,
                {
                    idempotencyKey: idempotencyKey,
                });
            if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Subscription was not updated`,
                } satisfies SubscriptionUpdateUnsuccessfulResponseBody);
            }
            return response.status(StatusCodes.OK).json({
                subscription: subscription
            } satisfies SubscriptionUpdateResponseBody);

        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionUpdateUnsuccessfulResponseBody);
        }
    }

    /**
    * @openapi
    *
    * /admin/subscription/list:
    *  get:
    *    summary: Get a list of subscriptions
    *    description: Get a list of subscriptions
    *    tags: [Subscription]
    *    parameters:
    *      - in: query
    *        name: customerId
    *        schema:
    *          type: string
    *          description: The customer id. If passed - returns filtered by this customer list of subscriptions.
    *          required: false
    *    responses:
    *      200:
    *        description: A list of subscriptions
    *        content:
    *          application/json:
    *            schema:
    *              $ref: '#/components/schemas/SubscriptionListResponseBody'
    *      400:
    *        $ref: '#/components/schemas/InvalidRequest'
    *      401:
    *        $ref: '#/components/schemas/UnauthorizedError'
    *      500:
    *        $ref: '#/components/schemas/InternalError'
    *      404:
    *        $ref: '#/components/schemas/NotFoundError'
    */

    public async list(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies SubscriptionListUnsuccessfulResponseBody);
        }
        const customerId = request.query.customerId;
        try {
            // Get the subscriptions
            const subscriptions = customerId 
            ? await stripe.subscriptions.list({
                    customer: customerId as string,
                })
            : await stripe.subscriptions.list();

            if (subscriptions.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Subscriptions were not found`,
                } satisfies SubscriptionListUnsuccessfulResponseBody);
            }
            return response.status(StatusCodes.OK).json({
                subscriptions: subscriptions
            } satisfies SubscriptionListResponseBody);
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionListUnsuccessfulResponseBody);
        }
    }


    /**
    * @openapi 
    *
    * /admin/subscription/get/{subscriptionId}:
    *   get:
    *     summary: Get a subscription
    *     description: Get a subscription
    *     tags: [Subscription]
    *     parameters:
    *       - in: path
    *         name: subscriptionId
    *         schema:
    *           type: string
    *           description: The subscription id
    *           required: true
    *     responses:
    *       200:
    *         description: The request was successful.
    *         content:
    *           application/json:
    *             schema:
    *                $ref: '#/components/schemas/SubscriptionGetResponseBody'
    *       400:
    *         $ref: '#/components/schemas/InvalidRequest'
    *       401:
    *         $ref: '#/components/schemas/UnauthorizedError'
    *       500:
    *         $ref: '#/components/schemas/InternalError'
    *       404:
    *         $ref: '#/components/schemas/NotFoundError'
    */
    async get(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies SubscriptionGetUnsuccessfulResponseBody);
        }
        const subscriptionId = request.params.subscriptionId;
        try {
            // Get the subscription
            const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
            if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Subscription was not found`,
                } satisfies SubscriptionGetUnsuccessfulResponseBody);
            }
            return response.status(StatusCodes.OK).json({
                subscription: subscription
            } satisfies SubscriptionGetResponseBody);
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionGetUnsuccessfulResponseBody);
        }
    }

    /**
    * @openapi
    *
    * /admin/subscription/cancel:
    *  post:
    *    summary: Cancel a subscription
    *    description: Cancels an existing subscription
    *    tags: [Subscription]
    *    requestBody:
    *      content:
    *        application/json:
    *          schema:
    *            $ref: '#/components/schemas/SubscriptionCancelRequestBody'
    *    responses:
    *      200:
    *        description: The request was successful.
    *        content:
    *          application/json:
    *            schema:
    *              $ref: '#/components/schemas/SubscriptionCancelResponseBody'
    *      400:
    *        $ref: '#/components/schemas/InvalidRequest'
    *      401:
    *        $ref: '#/components/schemas/UnauthorizedError'
    *      500:
    *        $ref: '#/components/schemas/InternalError'
    *      404:
    *        $ref: '#/components/schemas/NotFoundError'
    */ 
    async cancel(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies SubscriptionCancelUnsuccessfulResponseBody);
        }
        const {subscriptionId, idempotencyKey } = request.body satisfies SubscriptionCancelRequestBody;

        try {
            // Cancel the subscription
            const subscription = await stripe.subscriptions.cancel(
                subscriptionId as string,
                {
                    idempotencyKey: idempotencyKey
                });

            // Check if the subscription was cancelled
            if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Subscription was not deleted`,
                } satisfies SubscriptionCancelUnsuccessfulResponseBody);
            }
            return response.status(StatusCodes.OK).json({
                subscription: subscription
            } satisfies SubscriptionCancelResponseBody);
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionCancelUnsuccessfulResponseBody);
        }
    }

    /**
    * @openapi
    *
    * /admin/subscription/resume:
    * post:
    *   summary: Resume a subscription
    *   description: Resumes an existing subscription
    *   tags: [Subscription]
    *   requestBody:
    *     content:
    *       application/json:
    *         schema:
    *           $ref: '#/components/schemas/SubscriptionResumeRequestBody'
    *   responses:
    *     200:
    *       description: The request was successful.
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/SubscriptionResumeResponseBody'
    *     400:
    *       $ref: '#/components/schemas/InvalidRequest'
    *     401:
    *       $ref: '#/components/schemas/UnauthorizedError'
    *     500:
    *       $ref: '#/components/schemas/InternalError'
    *     404:
    *       $ref: '#/components/schemas/NotFoundError'
    */ 
    async resume(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies SubscriptionResumeUnsuccessfulResponseBody);
        }
        const { subscriptionId, idempotencyKey } = request.body satisfies SubscriptionResumeRequestBody;
        try {
            // Resume the subscription
            const subscription = await stripe.subscriptions.resume(
                subscriptionId as string, 
                {
                    idempotencyKey: idempotencyKey 
                });

            // Check if the subscription was resumed
            if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
                return response.status(StatusCodes.NOT_FOUND).json({
                    error: `Subscription was not resumed`,
                } satisfies SubscriptionResumeUnsuccessfulResponseBody);
            }
            return response.status(StatusCodes.OK).json({
                subscription: subscription
            } satisfies SubscriptionResumeResponseBody);
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionResumeUnsuccessfulResponseBody);
        }
    }
}