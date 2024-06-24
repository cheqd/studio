import type Stripe from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import type {
	SubscriptionCreateRequestBody,
	SubscriptionCreateResponseBody,
	SubscriptionCreateUnsuccessfulResponseBody,
	SubscriptionCancelResponseBody,
	SubscriptionCancelUnsuccessfulResponseBody,
	SubscriptionGetResponseBody,
	SubscriptionGetUnsuccessfulResponseBody,
	SubscriptionListResponseBody,
	SubscriptionListUnsuccessfulResponseBody,
	SubscriptionUpdateRequestBody,
	SubscriptionUpdateResponseBody,
	SubscriptionUpdateUnsuccessfulResponseBody,
	SubscriptionResumeUnsuccessfulResponseBody,
	SubscriptionResumeResponseBody,
	SubscriptionResumeRequestBody,
	SubscriptionCancelRequestBody,
} from '../../types/admin.js';
import { StatusCodes } from 'http-status-codes';
import { check } from '../validator/index.js';
import { SubscriptionService } from '../../services/admin/subscription.js';
import { stripeService } from '../../services/admin/stripe.js';
import type { UnsuccessfulResponseBody } from '../../types/shared.js';
import { validate } from '../validator/decorator.js';

dotenv.config();

export function syncCustomer(target: any, key: string, descriptor: PropertyDescriptor | undefined) {
	// save a reference to the original method this way we keep the values currently in the
	// descriptor and don't overwrite what another decorator might have done to the descriptor.
	if (descriptor === undefined) {
		descriptor = Object.getOwnPropertyDescriptor(target, key) as PropertyDescriptor;
	}

	const originalMethod = descriptor.value;

	//editing the descriptor/value parameter
	descriptor.value = async function (...args: any[]) {
		const response: Response = args[1];
		if (response.locals.customer) {
			try {
				await stripeService.syncCustomer(response.locals.customer);
			} catch (error) {
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: `Internal error: ${(error as Error)?.message || error}`,
				} satisfies UnsuccessfulResponseBody);
			}
		}
		return originalMethod.apply(this, args);
	};

	// return edited descriptor as opposed to overwriting the descriptor
	return descriptor;
}

export function syncOne(target: any, key: string, descriptor: PropertyDescriptor | undefined) {
	// save a reference to the original method this way we keep the values currently in the
	// descriptor and don't overwrite what another decorator might have done to the descriptor.
	if (descriptor === undefined) {
		descriptor = Object.getOwnPropertyDescriptor(target, key) as PropertyDescriptor;
	}

	const originalMethod = descriptor.value;

	//editing the descriptor/value parameter
	descriptor.value = async function (...args: any[]) {
		const response: Response = args[1];
		if (response.locals.customer) {
			try {
				await stripeService.syncOne(response.locals.customer);
			} catch (error) {
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: `Internal error: ${(error as Error)?.message || error}`,
				} satisfies UnsuccessfulResponseBody);
			}
		}
		return originalMethod.apply(this, args);
	};

	// return edited descriptor as opposed to overwriting the descriptor
	return descriptor;
}

export class SubscriptionController {
	static subscriptionCreateValidator = [
		check('price')
			.exists()
			.withMessage('price was not provided')
			.bail()
			.isString()
			.withMessage('price should be a string')
			.bail(),
		check('successURL')
			.exists()
			.withMessage('successURL was not provided')
			.bail()
			.isString()
			.withMessage('successURL should be a string')
			.bail(),
		check('cancelURL')
			.exists()
			.withMessage('cancelURL was not provided')
			.bail()
			.isString()
			.withMessage('cancelURL should be a string')
			.bail(),
		check('quantity').optional().isInt().withMessage('quantity should be an integer').bail(),
		check('trialPeriodDays').optional().isInt().withMessage('trialPeriodDays should be an integer').bail(),
		check('idempotencyKey').optional().isString().withMessage('idempotencyKey should be a string').bail(),
	];

	static subscriptionUpdateValidator = [
		check('returnURL')
			.exists()
			.withMessage('returnURL was not provided')
			.bail()
			.isString()
			.withMessage('returnURL should be a string')
			.bail(),
	];

	static subscriptionListValidator = [
		check('paymentProviderId').optional().isString().withMessage('customerId should be a string').bail(),
	];

	static subscriptionCancelValidator = [
		check('subscriptionId')
			.exists()
			.withMessage('subscriptionId was not provided')
			.bail()
			.isString()
			.withMessage('subscriptionId should be a string')
			.bail(),
		check('idempotencyKey').optional().isString().withMessage('idempotencyKey should be a string').bail(),
	];

	static subscriptionResumeValidator = [
		check('subscriptionId')
			.exists()
			.withMessage('subscriptionId was not provided')
			.bail()
			.isString()
			.withMessage('subscriptionId should be a string')
			.bail(),
		check('idempotencyKey').optional().isString().withMessage('idempotencyKey should be a string').bail(),
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

	@validate
	async create(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;

		const { price, successURL, cancelURL, quantity, idempotencyKey, trialPeriodDays } =
			request.body satisfies SubscriptionCreateRequestBody;
		try {
			const session = await stripe.checkout.sessions.create(
				{
					mode: 'subscription',
					customer: response.locals.customer.paymentProviderId,
					line_items: [
						{
							price: price,
							quantity: quantity || 1,
						},
					],
					success_url: successURL,
					cancel_url: cancelURL,
					subscription_data: {
						trial_period_days: trialPeriodDays,
					},
				},
				{
					idempotencyKey,
				}
			);

			if (session.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: 'Checkout session was not created',
				} satisfies SubscriptionCreateUnsuccessfulResponseBody);
			}

			if (!session.url) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: 'Checkout session URL was not provided',
				} satisfies SubscriptionCreateUnsuccessfulResponseBody);
			}

			return response.json({
				sessionURL: session.url as string,
			} satisfies SubscriptionCreateResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
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
	@validate
	@syncOne
	async update(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		const { returnURL, isManagePlan, priceId } = request.body satisfies SubscriptionUpdateRequestBody;
		try {
			// Get the subscription object from the DB
			const subscription = await SubscriptionService.instance.findOne({ customer: response.locals.customer });
			if (!subscription) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Subscription was not found`,
				} satisfies SubscriptionUpdateUnsuccessfulResponseBody);
			}
			// retrieve subscription to get subscription item id, which is different from subscriptionId.
			const _sub = await stripe.subscriptions.retrieve(subscription.subscriptionId as string);
			if (_sub.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Subscription was not found`,
				} satisfies SubscriptionGetUnsuccessfulResponseBody);
			}

			// Create portal link
			const session = await stripe.billingPortal.sessions.create({
				customer: response.locals.customer.paymentProviderId,
				return_url: returnURL,
				// based on request body, trigger a manage or confirm update flow.
				flow_data: isManagePlan
					? undefined
					: {
							type: 'subscription_update_confirm',
							subscription_update_confirm: {
								subscription: subscription.subscriptionId,
								items: [
									{
										id: _sub.items.data[0].id, // subscription item id
										price: priceId, // the new price
									},
								],
							},
							after_completion: {
								type: 'redirect',
								redirect: {
									return_url: returnURL,
								},
							},
						},
			});

			if (session.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: 'Billing portal session for updating the subscription was not created',
				} satisfies SubscriptionUpdateUnsuccessfulResponseBody);
			}
			return response.status(StatusCodes.OK).json({
				sessionURL: session.url,
			} satisfies SubscriptionUpdateResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
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
	 *        name: paymentProviderId
	 *        schema:
	 *          type: string
	 *          description: The customer id. If passed - returns filtered by this customer list of subscriptions.
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

	@validate
	@syncCustomer
	public async list(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		const paymentProviderId = response.locals.customer.paymentProviderId;
		try {
			// Get the subscriptions
			const subscriptions = paymentProviderId
				? await stripe.subscriptions.list({
						customer: paymentProviderId as string,
					})
				: await stripe.subscriptions.list();

			if (subscriptions.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Subscriptions were not found`,
				} satisfies SubscriptionListUnsuccessfulResponseBody);
			}
			return response.status(StatusCodes.OK).json({
				subscriptions: subscriptions,
			} satisfies SubscriptionListResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies SubscriptionListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/subscription/get:
	 *   get:
	 *     summary: Get a subscription
	 *     description: Get a subscription
	 *     tags: [Subscription]
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
	@validate
	@syncOne
	async get(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		try {
			// Get the subscriptionId from the request
			const _sub = await SubscriptionService.instance.findCurrent(response.locals.customer);
			if (!_sub) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Subscription was not found`,
				} satisfies SubscriptionGetUnsuccessfulResponseBody);
			}
			const subscription = await stripe.subscriptions.retrieve(_sub.subscriptionId as string);
			if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Subscription was not found`,
				} satisfies SubscriptionGetUnsuccessfulResponseBody);
			}
			return response.status(StatusCodes.OK).json({
				subscription: subscription,
			} satisfies SubscriptionGetResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
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
	@validate
	@syncOne
	async cancel(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		const { subscriptionId, idempotencyKey } = request.body satisfies SubscriptionCancelRequestBody;

		try {
			// Cancel the subscription
			const subscription = await stripe.subscriptions.cancel(subscriptionId as string, {
				idempotencyKey: idempotencyKey,
			});

			// Check if the subscription was cancelled
			if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: `Subscription was not deleted`,
				} satisfies SubscriptionCancelUnsuccessfulResponseBody);
			}
			return response.status(StatusCodes.OK).json({
				subscription: subscription,
			} satisfies SubscriptionCancelResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
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
	@validate
	@syncOne
	async resume(request: Request, response: Response) {
		const stripe = response.locals.stripe as Stripe;
		const { subscriptionId, idempotencyKey } = request.body satisfies SubscriptionResumeRequestBody;
		try {
			// Resume the subscription
			const subscription = await stripe.subscriptions.resume(subscriptionId as string, {
				idempotencyKey: idempotencyKey,
			});

			// Check if the subscription was resumed
			if (subscription.lastResponse?.statusCode !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: `Subscription was not resumed`,
				} satisfies SubscriptionResumeUnsuccessfulResponseBody);
			}
			return response.status(StatusCodes.OK).json({
				subscription: subscription,
			} satisfies SubscriptionResumeResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies SubscriptionResumeUnsuccessfulResponseBody);
		}
	}
}
