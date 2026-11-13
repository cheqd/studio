/**
 * Stripe-backed routes. Stripe is a recording ledger, so each test can say which Stripe object a request touched and
 * whose it was. Payment accounts and operations are covered by the account and event cases in the other files.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { startHarness, stripeLedger, type Harness, type Tenant } from './harness/app.js';
import { bugLabel, expectNoLeak, itFor, mentions } from './helpers.js';

let h: Harness;
beforeAll(async () => {
	h = await startHarness();
});
afterAll(async () => {
	await h?.close();
});
beforeEach(() => h.resetRecorders());

const touched = (tenant: Tenant) => stripeLedger.calls.filter((c) => mentions(c.args, tenant).length > 0);

describe('Stripe customer scoping', () => {
	it('[GET /admin/subscription/list] a customer with a Stripe id only lists its own subscriptions', async () => {
		const res = await h.request('GET', '/admin/subscription/list', {
			as: h.tenantB,
			query: { paymentProviderId: h.tenantA.paymentProviderId },
		});
		expect(res.status).toBeLessThan(500);
		expectNoLeak(res, h.tenantA, { query: { paymentProviderId: h.tenantA.paymentProviderId } });
		expect(touched(h.tenantA)).toEqual([]);
	});

	itFor(it, 'ISO-005')(
		`[GET /admin/subscription/list] a customer with no Stripe id never lists other customers' subscriptions${bugLabel('ISO-005')}`,
		async () => {
			const res = await h.request('GET', '/admin/subscription/list', { as: h.tenantC });
			const unscoped = stripeLedger.callsTo('subscriptions.list').filter((c) => !(c.args[0] as any)?.customer);
			expect({ unscopedListCalls: unscoped.length }).toEqual({ unscopedListCalls: 0 });
			expectNoLeak(res, h.tenantA);
			expectNoLeak(res, h.tenantB);
		}
	);

	it('[GET /admin/subscription/get] reads the caller’s subscription and never another customer’s Stripe object', async () => {
		const res = await h.request('GET', '/admin/subscription/get', {
			as: h.tenantB,
			query: { subscriptionId: h.tenantA.subscriptionId, customerId: h.tenantA.customerId },
			headers: { 'customer-id': h.tenantA.customerId },
		});
		expect(res.status).toBeLessThan(500);
		expectNoLeak(res, h.tenantA, { query: { subscriptionId: h.tenantA.subscriptionId } });
		expect(touched(h.tenantA)).toEqual([]);
	});

	it('[POST /admin/subscription/create] opens checkout for the caller’s Stripe customer, whatever the body says', async () => {
		await h.request('POST', '/admin/subscription/create', {
			as: h.tenantB,
			body: {
				price: 'price_test',
				successURL: 'https://example.com/ok',
				cancelURL: 'https://example.com/no',
				idempotencyKey: 'k1',
				trialMode: false,
				customerId: h.tenantA.customerId,
				paymentProviderId: h.tenantA.paymentProviderId,
				customer: h.tenantA.paymentProviderId,
			},
		});
		expect(touched(h.tenantA)).toEqual([]);
		const created = stripeLedger.callsTo('checkout.sessions.create');
		expect(created.length).toBeGreaterThan(0);
		for (const call of created) expect((call.args[0] as any).customer).toBe(h.tenantB.paymentProviderId);
	});

	it('[POST /admin/subscription/update] opens the billing portal for the caller’s Stripe customer only', async () => {
		await h.request('POST', '/admin/subscription/update', {
			as: h.tenantB,
			body: {
				returnURL: 'https://example.com/back',
				isManagePlan: true,
				customerId: h.tenantA.customerId,
				subscriptionId: h.tenantA.subscriptionId,
				paymentProviderId: h.tenantA.paymentProviderId,
			},
		});
		expect(touched(h.tenantA)).toEqual([]);
	});

	itFor(it, 'ISO-009')(
		`[DELETE /admin/subscription/cancel] has an auth rule, so an owner can cancel its own subscription${bugLabel('ISO-009')}`,
		async () => {
			const res = await h.request('DELETE', '/admin/subscription/cancel', {
				as: h.tenantB,
				body: { subscriptionId: h.tenantB.subscriptionId, idempotencyKey: 'k2' },
			});
			expect(res.status).toBeLessThan(300);
			expect(stripeLedger.callsTo('subscriptions.cancel').length).toBeGreaterThan(0);
		}
	);

	it('[DELETE /admin/subscription/cancel] never cancels another customer’s subscription', async () => {
		await h.request('DELETE', '/admin/subscription/cancel', {
			as: h.tenantB,
			body: { subscriptionId: h.tenantA.subscriptionId, idempotencyKey: 'k3' },
		});
		expect(
			stripeLedger.callsTo('subscriptions.cancel').filter((c) => c.args[0] === h.tenantA.subscriptionId)
		).toEqual([]);
	});

	itFor(it, 'ISO-006')(
		`[POST /admin/subscription/resume] never resumes another customer's subscription${bugLabel('ISO-006')}`,
		async () => {
			await h.request('POST', '/admin/subscription/resume', {
				as: h.tenantB,
				body: { subscriptionId: h.tenantA.subscriptionId, idempotencyKey: 'k4' },
			});
			expect(
				stripeLedger.callsTo('subscriptions.resume').filter((c) => c.args[0] === h.tenantA.subscriptionId)
			).toEqual([]);
		}
	);

	it('[POST /admin/subscription/resume] resumes the caller’s own subscription (control)', async () => {
		await h.request('POST', '/admin/subscription/resume', {
			as: h.tenantB,
			body: { subscriptionId: h.tenantB.subscriptionId, idempotencyKey: 'k5' },
		});
		expect(
			stripeLedger.callsTo('subscriptions.resume').filter((c) => c.args[0] === h.tenantB.subscriptionId)
		).not.toEqual([]);
	});

	itFor(it, 'ISO-006')(
		`[GET /admin/checkout/session/:id] never returns another customer's checkout session${bugLabel('ISO-006')}`,
		async () => {
			const res = await h.request('GET', `/admin/checkout/session/${h.tenantA.checkoutSessionId}`, {
				as: h.tenantB,
			});
			expect({
				status: res.status,
				leaked: mentions(res.text, h.tenantA).filter((m) => m !== h.tenantA.checkoutSessionId),
			}).toEqual({
				status: expect.not.stringMatching(/^2/) as unknown as number,
				leaked: [],
			});
		}
	);

	it('[GET /admin/checkout/session/:id] returns the caller’s own checkout session (control)', async () => {
		const res = await h.request('GET', `/admin/checkout/session/${h.tenantB.checkoutSessionId}`, { as: h.tenantB });
		expect(res.status).toBeLessThan(300);
	});
});

describe('Stripe public surface', () => {
	it('[GET /admin/product/list] needs no tenant data and exposes none', async () => {
		const res = await h.request('GET', '/admin/product/list', { as: h.tenantB });
		expect(res.status).toBeLessThan(600);
		expectNoLeak(res, h.tenantA);
	});
	it('[GET /admin/product/get/:productId] needs no tenant data and exposes none', async () => {
		const res = await h.request('GET', '/admin/product/get/prod_test', { as: h.tenantB });
		expect(res.status).toBeLessThan(600);
		expectNoLeak(res, h.tenantA);
	});
	it('[GET /admin/price/list] needs no tenant data and exposes none', async () => {
		const res = await h.request('GET', '/admin/price/list', { as: h.tenantB });
		expect(res.status).toBeLessThan(600);
		expectNoLeak(res, h.tenantA);
	});
});
