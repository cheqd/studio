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
 *         quantity:
 *           type: number
 *           description: The quantity of the product
 *           example: 1
 *         trialPeriodDays:
 *           type: number
 *           description: The number of days the customer has to pay for the product
 *           example: 7
 *         idempotencyKey:
 *           type: string
 *           description: The idempotency key. It helps to prevent duplicate requests. In case if there was a request with the same idempotency key, the response will be the same as for the first request.
 *           example: abcdefghijklmnopqrstuvwxyz
 *     SubscriptionCreateResponseBody:
 *       description: The response body for creating a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: An object with link to checkout session. For more information see the [Stripe API documentation](https://docs.stripe.com/api/checkout/sessions/object)
 *           properties:
 *             sessionURL:
 *               type: string
 *               description: URL which user should follow to manage subscription
 *     SubscriptionUpdateRequestBody:
 *       description: The request body for updating a subscription
 *       type: object
 *       properties:
 *         returnURL:
 *           type: string
 *           description: URL which is used to redirect to the page with ability to update the subscription
 *     SubscriptionUpdateResponseBody:
 *       description: The response body for updating a subscription
 *       type: object
 *       properties:
 *         subscription:
 *           type: object
 *           description: Object with redirect url inside
 *           properties:
 *             sessionURL:
 *               type: string
 *               description: URL with session URL rediect to
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
 *             description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object)
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
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object)
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
 *           description: A subscription object from Stripe. For more information see the [Stripe API documentation](https://docs.stripe.com/api/subscriptions/object)
 *     CheckoutSessionGetResponseBody:
 *       description: the response body for GET Stripe Checkout Session API
 *       type: object
 *       properties:
 *         session:
 *           type: object
 *           description: A Stripe checkout session object. For more information, see the [Stripe API documentation](https://docs.stripe.com/api/checkout/sessions/object)
 *     APIKeyResponse:
 *       description: The general view for API key in response
 *       type: object
 *       properties:
 *         apiKey:
 *           type: string
 *           description: The API key
 *           example: abcdefghijklmnopqrstuvwxyz
 *         createdAt:
 *           type: string
 *           description: The creation date of the API key
 *           example: "2000-10-31T01:23:45Z"
 *           format: date-time
 *         name:
 *           type: string
 *           description: The name of the API key
 *           example: My API Key
 *         expiresAt:
 *           type: string
 *           description: The expiration date of the API key
 *           example: "2000-10-31T01:23:45Z"
 *           format: date-time
 *         revoked:
 *           type: boolean
 *           description: The status of the API key
 *           example: false
 *     APIKeyCreateRequestBody:
 *       description: The request body for creating an API key
 *       type: object
 *       properties:
 *         expiresAt:
 *           type: string
 *           description: The expiration date of the API key
 *           example: "2000-10-31T01:23:45Z"
 *           format: date-time
 *         name:
 *           type: string
 *           description: The name of the API key
 *           example: My API Key
 *       required:
 *         - name
 *     APIKeyCreateResponseBody:
 *       allOf:
 *          - $ref: '#/components/schemas/APIKeyResponse'
 *          - description: The response body for creating an API key
 *     APIKeyCreateUnsuccessfulResponseBody:
 *       description: The response body for an unsuccessful API key creation
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: API key creation unsuccessful
 *     APIKeyUpdateRequestBody:
 *       description: The request body for updating an API key
 *       type: object
 *       properties:
 *         apiKey:
 *           type: string
 *           description: The API key
 *           example: abcdefghijklmnopqrstuvwxyz
 *         name:
 *           type: string
 *           description: The name of the API key
 *           example: My API Key
 *         expiresAt:
 *           type: string
 *           description: The expiration date of the API key
 *           example: 2000-10-31T01:23:45Z
 *           format: date-time
 *         revoked:
 *           type: boolean
 *           description: The status of the API key
 *           example: false
 *           default: false
 *       required:
 *         - apiKey
 *     APIKeyUpdateResponseBody:
 *       allOf:
 *          - $ref: '#/components/schemas/APIKeyResponse'
 *          - description: The response body for an successful API key update
 *     APIKeyUpdateUnsuccessfulResponseBody:
 *       description: The response body for an unsuccessful API key update
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: API key update unsuccessful
 *     APIKeyRevokeRequestBody:
 *       description: The request body for revoking an API key
 *       type: object
 *       properties:
 *         apiKey:
 *           type: string
 *           description: The API key
 *           example: abcdefghijklmnopqrstuvwxyz
 *       required:
 *         - apiKey
 *     APIKeyRevokeResponseBody:
 *        description: The response body for revoking an API key
 *        type: object
 *        properties:
 *          apiKey:
 *            type: string
 *            description: The API key
 *            example: abcdefghijklmnopqrstuvwxyz
 *          revoked:
 *            type: boolean
 *            description: The status of the API key
 *            example: true
 *        required:
 *          - apiKey
 *     APIKeyRevokeUnsuccessfulResponseBody:
 *       description: The response body for an unsuccessful API key revocation
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: API key revocation unsuccessful
 *     APIKeyListResponseBody:
 *       description: The response body for listing API keys
 *       type: object
 *       properties:
 *         apiKeys:
 *           type: array
 *           items:
 *              $ref: '#/components/schemas/APIKeyResponse'
 *     APIKeyGetRequestBody:
 *       description: The request body for getting an API key
 *       type: object
 *       properties:
 *         apiKey:
 *           type: string
 *           description: The API key
 *           example: abcdefghijklmnopqrstuvwxyz
 *       required:
 *         - apiKey
 *     APIKeyGetResponseBody:
 *       allOf:
 *          - $ref: '#/components/schemas/APIKeyResponse'
 *          - description: The response body for getting an API key
 *     OrganisationResponseBody:
 *       description: The response body for an organisation
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: The name of the organisation
 *           example: Cheqd
 *         email:
 *           type: string
 *           description: The email of the organisation
 *           example: cheqd@example.com
 *           format: email
 *           nullable: true
 *           default: null
 *         description:
 *           type: string
 *           description: The description of the organisation
 *           example: Cheqd organisation
 *           nullable: true
 *           default: null
 *         cosmosAddress:
 *           type: string
 *           description: The cosmos address of the organisation
 *           example: cheqd1hwzvac94udsk8x4mf6htt544lev4jltkwgxp7u
 *     NotFoundError:
 *       description: The requested resource could not be found but may be available in the future. Subsequent requests by the client are permissible.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Not Found Error
 */
