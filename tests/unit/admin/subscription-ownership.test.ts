import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));

const { SubscriptionController } = await import('../../../src/controllers/admin/subscriptions.js');
const { SubscriptionService } = await import('../../../src/services/admin/subscription.js');
const { stripeService } = await import('../../../src/services/admin/stripe.js');

const OWN = 'sub_own';
const OTHER = 'sub_other';

function makeResponse() {
	const stripe = {
		subscriptions: {
			cancel: jest.fn(async () => ({ id: OWN, lastResponse: { statusCode: 200 } })),
			resume: jest.fn(async () => ({ id: OWN, lastResponse: { statusCode: 200 } })),
		},
	};
	const response = {
		locals: { customer: { customerId: 'customer-1' }, stripe },
		statusCode: 200,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	};
	return { response, stripe };
}

beforeEach(() => {
	jest.spyOn(stripeService, 'syncOne').mockResolvedValue(undefined);
	jest.spyOn(SubscriptionService.instance, 'get').mockImplementation(async (id?: string) => {
		if (id === OWN) return { subscriptionId: OWN, customer: { customerId: 'customer-1' } } as never;
		if (id === OTHER) return { subscriptionId: OTHER, customer: { customerId: 'customer-2' } } as never;
		return null;
	});
});
afterEach(() => {
	jest.restoreAllMocks();
});

describe.each(['cancel', 'resume'] as const)('subscription %s', (action) => {
	const call = async (subscriptionId: string) => {
		const { response, stripe } = makeResponse();
		const request = { body: { subscriptionId } } as unknown as Request;
		await new SubscriptionController()[action](request, response as unknown as Response);
		return { response, stripeCall: stripe.subscriptions[action] };
	};

	it('acts on a subscription of the calling customer', async () => {
		const { response, stripeCall } = await call(OWN);
		expect(response.statusCode).toBe(200);
		expect(stripeCall).toHaveBeenCalledTimes(1);
	});

	it("refuses another customer's subscription with the same 404 as an unknown one, and never calls Stripe", async () => {
		const other = await call(OTHER);
		const unknown = await call('sub_unknown');
		expect(other.response.statusCode).toBe(404);
		expect(other.response.body).toEqual(unknown.response.body);
		expect(unknown.response.statusCode).toBe(404);
		expect(other.stripeCall).not.toHaveBeenCalled();
		expect(unknown.stripeCall).not.toHaveBeenCalled();
	});
});
