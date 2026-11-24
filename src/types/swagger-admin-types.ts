/**
 * @openapi
 *
 * components:
 *   parameters:
 *     AnalyticsRange:
 *       in: query
 *       name: range
 *       description: >-
 *         Days to look back, counting today as whole UTC days, or `all` (from the UTC day of the first sign-up to
 *         today). Do not combine with `from` and `to`.
 *       schema:
 *         type: string
 *         enum: ['7', '30', '90', all]
 *         default: '30'
 *     AnalyticsFrom:
 *       in: query
 *       name: from
 *       description: >-
 *         First UTC day of a custom window (YYYY-MM-DD), with `to`. The window spans at most 400 days, both ends
 *         included. Not with `range`.
 *       schema:
 *         type: string
 *         format: date
 *         example: '2026-10-01'
 *     AnalyticsTo:
 *       in: query
 *       name: to
 *       description: Last UTC day of a custom window (YYYY-MM-DD), included, with `from`.
 *       schema:
 *         type: string
 *         format: date
 *         example: '2026-10-31'
 *     AnalyticsSegment:
 *       in: query
 *       name: segment
 *       description: >-
 *         `agents`: the customer has at least one non-deleted agent. `people`: no agents, but it has issued a
 *         credential. `unclassified`: neither. `all`: no filter.
 *       schema:
 *         type: string
 *         enum: [agents, people, unclassified, all]
 *         default: all
 *   schemas:
 *     AdminDayCount:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           example: '2026-11-13'
 *         count:
 *           type: integer
 *     AdminCustomer:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string }
 *         email: { type: string }
 *         plan: { type: string, example: Build }
 *         network: { type: string, enum: [mainnet, testnet] }
 *         createdAt: { type: string, format: date-time }
 *         lastActiveAt: { type: string, format: date-time, nullable: true }
 *         status: { type: string, enum: [active, inactive] }
 *         usage:
 *           type: object
 *           properties:
 *             apiCalls30d: { type: integer }
 *             identifiers: { type: integer }
 *             credentials: { type: integer }
 *             keys: { type: integer, deprecated: true, description: 'Deprecated: the count of DID keys. Use didKeys.' }
 *             didKeys: { type: integer, description: 'DID keys held by the customer.' }
 *             apiKeys: { type: integer, description: 'API keys that are not revoked.' }
 *     AdminCustomerDetail:
 *       allOf:
 *         - $ref: '#/components/schemas/AdminCustomer'
 *         - type: object
 *           properties:
 *             paymentPlan: { type: string, example: active }
 *             agentCount: { type: integer }
 *             segment: { type: string, enum: [agents, people, unclassified] }
 *             milestones:
 *               $ref: '#/components/schemas/AdminCustomerMilestones'
 *     AdminCustomerMilestones:
 *       type: object
 *       description: >-
 *         When the customer first reached each milestone, or null if it has not yet. Recorded once, when the event
 *         happens; dates from before recording started come from a backfill over existing data.
 *       properties:
 *         firstIdentifierAt: { type: string, format: date-time, nullable: true, description: 'First DID created.' }
 *         firstAgentAt: { type: string, format: date-time, nullable: true, description: 'First agent registered.' }
 *         firstApiKeyAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: First API key the customer created itself; portal session keys do not count.
 *         firstCredentialIssuedAt: { type: string, format: date-time, nullable: true }
 *         firstStatusListAt: { type: string, format: date-time, nullable: true }
 *         firstFaucetRequestAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: First faucet request that credited the account.
 *         firstApiCallAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: First tracked operation of any kind.
 *     AdminFunnelStep:
 *       type: object
 *       properties:
 *         key: { type: string, example: first-api-key }
 *         label: { type: string, example: First API key }
 *         accounts: { type: integer }
 *         medianSecondsFromPrevious: { type: integer, nullable: true }
 *     AdminStalledAccounts:
 *       type: object
 *       properties:
 *         journey: { type: string, enum: [first-credential, first-agent, first-api-call] }
 *         step: { type: string, example: first-did }
 *         stepLabel: { type: string, example: First DID created }
 *         previousStep: { type: string, example: funded }
 *         previousStepLabel: { type: string, example: Funded address }
 *         range: { description: 'The days of a preset window (7, 30 or 90, a number), or all, or custom.', example: 30 }
 *         from: { type: string, format: date, nullable: true, description: 'Null for range=all.' }
 *         to: { type: string, format: date }
 *         segment: { type: string, enum: [agents, people, unclassified, all] }
 *         page: { type: integer }
 *         limit: { type: integer }
 *         total: { type: integer, description: 'Stalled accounts across all pages.' }
 *         accounts:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               ref:
 *                 type: string
 *                 description: Short opaque reference, stable across pages and calls. Not the customer id.
 *                 example: acct_3f9a1c07b2d4
 *               signedUpAt: { type: string, format: date-time }
 *               lastActiveAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Last tracked operation, or null if none.
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
 *         expired:
 *           type: boolean
 *           description: Whether the expiry has passed, by the server clock (UTC). An expired key is rejected with 401 on every request.
 *           example: false
 *     APIKeyCreateRequestBody:
 *       description: The request body for creating an API key
 *       type: object
 *       properties:
 *         expiresAt:
 *           type: string
 *           description: The expiration date of the API key. Optional on creation; when omitted the key expires 30 days after creation. It must be in the future and no more than 730 days ahead (the server's `API_KEY_MAX_EXPIRATION_DAYS` setting, default 730); otherwise the request is rejected with 400. A key stops authenticating, with 401, at this instant.
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
 *           description: The new expiration date of the API key. It must be in the future and no more than 730 days ahead (`API_KEY_MAX_EXPIRATION_DAYS`, default 730).
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
 *           type: object
 *           description: The cosmos address of the organisation
 *           properties:
 *             testnet:
 *               type: string
 *               example: cheqd1hwzvac94udsk8x4mf6htt544lev4jltkwgxp7u
 *               nullable: true
 *             mainnet:
 *               type: string
 *               nullable: true
 *               example: cheqd1hwzvac94udsk8x4mf6htt544lev4jltkwgxp7u
 *     NotFoundError:
 *       description: The requested resource could not be found but may be available in the future. Subsequent requests by the client are permissible.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Not Found Error
 */
