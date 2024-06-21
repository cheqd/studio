import type Stripe from 'stripe';
import type { UnsuccessfulResponseBody } from './shared.js';

export type ProductWithPrices = Stripe.Product & {
	prices?: Stripe.Price[];
};

export type APIServiceOptions = {
	decryptionNeeded: boolean;
};

export type ProductListUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type ProductGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;

export type ProductListResponseBody = {
	products: Stripe.ApiList<ProductWithPrices>;
};

export type ProductGetResponseBody = {
	product: ProductWithPrices;
};

// Prices
// List
export type PriceListResponseBody = {
	prices: Stripe.ApiList<Stripe.Price>;
};
export type PriceListUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Subscription
// Create
export type SubscriptionCreateRequestBody = {
	price: string;
	successURL: string;
	cancelURL: string;
	quantity?: number;
	trialPeriodDays?: number;
	idempotencyKey?: string;
};

export type SubscriptionCreateResponseBody = {
	sessionURL: Stripe.Checkout.Session['client_secret'];
};

export type SubscriptionUpdateResponseBody = {
	sessionURL: string;
};

// Update
export type SubscriptionUpdateRequestBody = {
	returnUrl: string;
	isManagePlan: boolean;
	priceId?: string;
};

// Get
export type SubscriptionGetRequestBody = {
	subscriptionId: string;
};

export type SubscriptionGetResponseBody = {
	subscription: Stripe.Response<Stripe.Subscription>;
};

// List
export type SubscriptionListResponseBody = {
	subscriptions: Stripe.Response<Stripe.ApiList<Stripe.Subscription>>;
};

// Delete
export type SubscriptionCancelRequestBody = {
	subscriptionId: string;
};

export type SubscriptionCancelResponseBody = {
	subscription: Stripe.Subscription;
	idempotencyKey?: string;
};

//Resume

export type SubscriptionResumeRequestBody = {
	subscriptionId: string;
	idempotencyKey?: string;
};

export type SubscriptionResumeResponseBody = {
	subscription: Stripe.Response<Stripe.Subscription>;
};

export type SubscriptionCreateUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionListUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionUpdateUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionCancelUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionResumeUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Customer
// Get

export type PortalCustomerGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// API key
export type APIKeyResponseBody = {
	apiKey: string;
	name: string;
	createdAt: string;
	expiresAt: string;
	revoked: boolean;
};
// Create
export type APIKeyCreateRequestBody = {
	name: string;
	expiresAt?: Date;
};

export type APIKeyCreateResponseBody = APIKeyResponseBody;
export type APIKeyCreateUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Update
export type APIKeyUpdateRequestBody = {
	apiKey: string;
	name?: string;
	expiresAt?: Date;
	revoked?: boolean;
};
export type APIKeyUpdateResponseBody = APIKeyResponseBody;

export type APIKeyUpdateUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Revoke
export type APIKeyRevokeRequestBody = {
	apiKey: string;
};
export type APIKeyRevokeResponseBody = {
	apiKey: string;
	revoked: boolean;
};
export type APIKeyRevokeUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// List
export type APIKeyListResponseBody = {
	apiKeys: APIKeyResponseBody[];
};
export type APIKeyListUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Get
export type APIKeyGetRequestBody = APIKeyResponseBody;
export type APIKeyGetResponseBody = APIKeyCreateResponseBody;
export type APIKeyGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Organisation
export type AdminOrganisationResponseBody = {
	name: string;
	email?: string;
	description?: string;
	cosmosAddress?: string;
};

export type AdminOrganisationGetResponseBody = AdminOrganisationResponseBody;
export type AdminOrganisationGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;

export type AdminOrganisationUpdateRequestBody = {
	name?: string;
	email?: string;
	description?: string;
};
export type AdminOrganisationUpdateResponseBody = AdminOrganisationGetResponseBody;
export type AdminOrganisationUpdateUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Utils

export type PaymentBehavior = Stripe.SubscriptionCreateParams.PaymentBehavior;
