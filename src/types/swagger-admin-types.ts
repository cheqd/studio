/**
 * @openapi
 *
 * components:
 *   schemas:
 *     PriceListResponseBody:
 *       description: A list of active prcies from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/prices/list)
 *       type: object
 *       properties:
 *         prices:
 *           type: array
 *           items:
 *             type: object
 *             description: A price object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/prices/object)
 *     ProductListResponseBody:
 *       type: object
 *       properties:
 *         products:
 *           type: array
 *           items:
 *             type: object
 *             description: A product object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/products/object)
 *     ProductGetResponseBody:
 *       description: A product with or without prices inside. For more information see the [Stripe API documentation](https://docs.stripe.com/api/products/retrieve)
 *       type: object
 *     InvalidRequest:
 *       description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: InvalidRequest
 *     InternalError:
 *       description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Internal Error
 *     UnauthorizedError:
 *       description: Access token is missing or invalid
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Unauthorized Error
 *     SubscriptionCreateRequestBody:
 *       description: The request body for creating a subscription
 *       type: object
 *       properties:
 *         customerId:
 *           type: string
 *           description: The Stripe customer id
 *           example: cus_1234567890
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               price:
 *                 type: string
 *                 description: The price id
 *                 example: price_1234567890
 *         idempotencyKey:
 *           type: string
 *           description: The idempotency key. It helps to prevent duplicate requests. In case if there was a request with the same idempotency key, the response will be the same as for the first request.
 *           example: abcdefghijklmnopqrstuvwxyz
 *
 *     SubscriptionCreateResponseBody:
 *       description: The response body for creating a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object)
 *     SubscriptionUpdateRequestBody:
 *       description: The request body for updating a subscription
 *       type: object
 *       properties:
 *         subscriptionId:
 *           type: string
 *           description: The subscription id
 *           example: sub_1234567890
 *         updateParams:
 *           type: object
 *           description: The subscription update parameters. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/update)
 *         idempotencyKey:
 *           type: string
 *           description: The idempotency key. It helps to prevent duplicate requests. In case if there was a request with the same idempotency key, the response will be the same as for the first request.
 *           example: abcdefghijklmnopqrstuvwxyz
 *     SubscriptionUpdateResponseBody:
 *       description: The response body for updating a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object)
 *     SubscriptionGetRequestBody:
 *       description: The request body for getting a subscription
 *       type: object
 *       properties:
 *         subscriptionId:
 *           type: string
 *           description: The subscription id
 *           example: sub_1234567890
 *     SubscriptionGetResponseBody:
 *       description: The response body for getting a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object)
 *     SubscriptionListRequestBody:
 *       description: The request body for listing subscriptions
 *       type: object
 *       properties:
 *         customerId:
 *           type: string
 *           description: The Stripe customer id
 *           example: cus_1234567890
 *     SubscriptionListResponseBody:
 *       description: The response body for listing subscriptions
 *       type: object
 *       properties:
 *         subscriptions:
 *           type: array
 *           items:
 *             type: object
 *             description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object]
 *     SubscriptionCancelRequestBody:
 *       description: The request body for canceling a subscription
 *       type: object
 *       properties:
 *         subscriptionId:
 *           type: string
 *           description: The subscription id
 *           example: sub_1234567890
 *     SubscriptionCancelResponseBody:
 *       description: The response body for canceling a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object]
 *         idempotencyKey:
 *           type: string
 *           description: The idempotency key. It helps to prevent duplicate requests. In case if there was a request with the same idempotency key, the response will be the same as for the first request.
 *           example: abcdefghijklmnopqrstuvwxyz
 *     SubscriptionResumeRequestBody:
 *       description: The request body for resuming a subscription
 *       type: object
 *       properties:
 *         subscriptionId:
 *           type: string
 *           description: The subscription id
 *           example: sub_1234567890
 *         idempotencyKey:
 *            type: string
 *            description: The idempotency key. It helps to prevent duplicate requests. In case if there was a request with the same idempotency key, the response will be the same as for the first request.
 *            example: abcdefghijklmnopqrstuvwxyz
 *     SubscriptionResumeResponseBody:
 *       description: The response body for resuming a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object]
 *     CheckoutSessionCreateRequestBody:
 *       description: The request body for creating a checkout session
 *       type: object
 *       properties:
 *         price:
 *           type: string
 *           description: The price id
 *           example: price_1234567890
 *         successURL:
 *           type: string
 *           description: The URL to redirect to after the customer sucessfully completes the checkout
 *           example: https://example.com/success
 *         cancelURL:
 *           type: string
 *           description: The URL to redirect to after the customer cancels the checkout
 *           example: https://example.com/cancel
 *         idempotencyKey:
 *           type: string
 *           description: The idempotency key. It helps to prevent duplicate requests. In case if there was a request with the same idempotency key, the response will be the same as for the first request.
 *           example: abcdefghijklmnopqrstuvwxyz
 *     NotFoundError:
 *       description: The requested resource could not be found but may be available in the future. Subsequent requests by the client are permissible.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Not Found Error
 */
