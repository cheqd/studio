import { Stripe } from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type { SubscriptionCreateRequestBody, SubscriptionCreateResponseBody, SubscriptionCreateUnsuccessfulResponseBody, SubscriptionCancelResponseBody, SubscriptionCancelUnsuccessfulResponseBody, SubscriptionGetResponseBody, SubscriptionGetUnsuccessfulResponseBody, SubscriptionListResponseBody, SubscriptionListUnsuccessfulResponseBody, SubscriptionUpdateRequestBody, SubscriptionUpdateResponseBody, SubscriptionUpdateUnsuccessfulResponseBody, SubscriptionResumeUnsuccessfulResponseBody, SubscriptionResumeResponseBody, SubscriptionResumeRequestBody, SubscriptionCancelRequestBody } from '../types/portal.js';
import { StatusCodes } from 'http-status-codes';
import { validationResult } from './validator/index.js';
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
            return response.status(StatusCodes.OK).json({
                subscription: subscription
            } satisfies SubscriptionCreateResponseBody );
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
                error: `Internal error: ${(error as Error)?.message || error}` 
            } satisfies SubscriptionCreateUnsuccessfulResponseBody);
        }
    }

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

    async get(request: Request, response: Response) {
        // Validate request
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ 
                error: result.array().pop()?.msg 
            } satisfies SubscriptionGetUnsuccessfulResponseBody);
        }
        const subscriptionId = request.query.subscriptionId;
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