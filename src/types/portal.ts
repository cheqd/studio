import type Stripe from "stripe";
import type { UnsuccessfulResponseBody } from "./shared.js";

export type ProductWithPrices = Stripe.Product & {
    prices?: Stripe.Price[];
};

export type ProductListUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type ProductGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;


export type ProductListResponseBody = {
    products: Stripe.ApiList<ProductWithPrices>;
}

export type ProductGetResponseBody = {
    product: ProductWithPrices;
}

// Prices
// List
export type PriceListResponseBody = {
    prices: Stripe.ApiList<Stripe.Price>;
}
export type PriceListUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Subscription
// Create
export type SubscriptionCreateRequestBody = {
    items: [{ price: string }];
    idempotencyKey?: string;
}

export type SubscriptionCreateResponseBody = {
    subscription: Stripe.Response<Stripe.Subscription>;
}

// Update
export type SubscriptionUpdateRequestBody = {
    subscriptionId: string;
    updateParams: Stripe.SubscriptionUpdateParams;
    idempotencyKey?: string;

}

export type SubscriptionUpdateResponseBody = {
    subscription: Stripe.Response<Stripe.Subscription>;
}

// Get
export type SubscriptionGetRequestBody = {
    subscriptionId: string;
}

export type SubscriptionGetResponseBody = {
    subscription: Stripe.Response<Stripe.Subscription>;
}

// List
export type SubscriptionListResponseBody = {
    subscriptions: Stripe.Response<Stripe.ApiList<Stripe.Subscription>>;
}

// Delete
export type SubscriptionCancelRequestBody = {
    subscriptionId: string;
}

export type SubscriptionCancelResponseBody = {
    subscription: Stripe.Subscription;
    idempotencyKey?: string;
}

//Resume

export type SubscriptionResumeRequestBody = {
    subscriptionId: string;
    idempotencyKey?: string;
}

export type SubscriptionResumeResponseBody = {
    subscription: Stripe.Response<Stripe.Subscription>;
}

export type SubscriptionCreateUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionListUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionUpdateUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionCancelUnsuccessfulResponseBody = UnsuccessfulResponseBody;
export type SubscriptionResumeUnsuccessfulResponseBody = UnsuccessfulResponseBody;

// Customer
// Get

export type PortalCustomerGetUnsuccessfulResponseBody = UnsuccessfulResponseBody;


// Checkout Session
export type CheckoutSessionCreateRequestBody = {
    price: string;
    successURL: string;
    cancelURL: string;
    quantity?: number;
    idempotencyKey?: string;
}
export type CheckoutSessionCreateResponseBody = {
    clientSecret: Stripe.Checkout.Session['client_secret'];
}

export type CheckoutSessionCreateUnsuccessfulResponseBody = UnsuccessfulResponseBody;
// Utils

export type PaymentBehavior = Stripe.SubscriptionCreateParams.PaymentBehavior;