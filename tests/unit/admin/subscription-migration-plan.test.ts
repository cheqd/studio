import { describe, expect, it } from '@jest/globals';
import {
	addOneCalendarMonth,
	buildCustomerMigrationPlan,
	type MigrationProducts,
	type MigrationSubscription,
} from '../../../src/services/admin/subscription-migration-plan.js';

const products: MigrationProducts = {
	explorerProductId: 'prod_explorer',
	basicProductId: 'prod_basic_new',
	basicPriceId: 'price_basic_monthly',
	buildProductId: 'prod_build',
	buildPriceId: 'price_build_monthly',
};

function subscription(overrides: Partial<MigrationSubscription> = {}): MigrationSubscription {
	return {
		id: 'sub_explorer',
		customerId: 'cus_123',
		status: 'active',
		created: 100,
		collectionMethod: 'charge_automatically',
		cancelAtPeriodEnd: false,
		hasDiscount: false,
		items: [{ id: 'si_explorer', priceId: 'price_explorer', productId: 'prod_explorer' }],
		...overrides,
	};
}

describe('Studio subscription migration planning', () => {
	it('moves an Explorer-only customer to Basic', () => {
		const plan = buildCustomerMigrationPlan([subscription()], products);

		expect(plan).toMatchObject({ action: 'update', target: 'basic', targetPriceId: 'price_basic_monthly' });
	});

	it('moves a legacy non-Explorer product to Build', () => {
		const plan = buildCustomerMigrationPlan(
			[
				subscription({
					id: 'sub_legacy_basic',
					items: [{ id: 'si_legacy', priceId: 'price_legacy', productId: 'prod_basic_old' }],
				}),
			],
			products
		);

		expect(plan).toMatchObject({ action: 'update', target: 'build', targetPriceId: 'price_build_monthly' });
	});

	it('treats the new Basic product as an idempotent terminal state', () => {
		const plan = buildCustomerMigrationPlan(
			[
				subscription({
					id: 'sub_basic',
					items: [{ id: 'si_basic', priceId: 'price_basic_monthly', productId: 'prod_basic_new' }],
				}),
			],
			products
		);

		expect(plan).toMatchObject({ action: 'noop', target: 'basic' });
	});

	it('gives Build precedence and selects the non-Explorer subscription', () => {
		const custom = subscription({
			id: 'sub_custom',
			created: 90,
			items: [{ id: 'si_custom', priceId: 'price_custom', productId: 'prod_custom' }],
		});
		const plan = buildCustomerMigrationPlan([subscription(), custom], products);

		expect(plan).toMatchObject({
			action: 'update',
			target: 'build',
			sourceSubscriptionId: 'sub_custom',
			secondarySubscriptionIds: ['sub_explorer'],
		});
	});

	it('does not reset a Build subscription trial during a rerun', () => {
		const build = subscription({
			id: 'sub_build',
			status: 'trialing',
			items: [{ id: 'si_build', priceId: 'price_build_monthly', productId: 'prod_build' }],
		});
		const custom = subscription({
			id: 'sub_custom',
			items: [{ id: 'si_custom', priceId: 'price_custom', productId: 'prod_custom' }],
		});
		const plan = buildCustomerMigrationPlan([custom, build], products);

		expect(plan).toMatchObject({ action: 'noop', target: 'build', sourceSubscriptionId: 'sub_build' });
	});

	it('does not block an existing target subscription that uses invoice collection', () => {
		const plan = buildCustomerMigrationPlan(
			[
				subscription({
					id: 'sub_build',
					collectionMethod: 'send_invoice',
					items: [{ id: 'si_build', priceId: 'price_build_monthly', productId: 'prod_build' }],
				}),
			],
			products
		);

		expect(plan).toMatchObject({ action: 'noop', target: 'build' });
	});

	it('creates a replacement trial for a paused subscription', () => {
		const plan = buildCustomerMigrationPlan(
			[
				subscription({
					status: 'paused',
					items: [{ id: 'si_legacy', priceId: 'price_legacy', productId: 'prod_basic_old' }],
				}),
			],
			products
		);

		expect(plan).toMatchObject({ action: 'create', target: 'build' });
	});

	it('blocks a moved subscription with an existing discount', () => {
		const plan = buildCustomerMigrationPlan([subscription({ hasDiscount: true })], products);

		expect(plan).toMatchObject({ action: 'blocked', reason: 'canonical_subscription_has_a_discount' });
	});

	it('can explicitly clear a discount while moving a subscription', () => {
		const plan = buildCustomerMigrationPlan([subscription({ hasDiscount: true })], products, {
			clearExistingDiscounts: true,
		});

		expect(plan).toMatchObject({ action: 'update', clearExistingDiscount: true });
	});

	it('blocks subscriptions with multiple items', () => {
		const plan = buildCustomerMigrationPlan(
			[
				subscription({
					items: [
						{ id: 'si_one', priceId: 'price_explorer', productId: 'prod_explorer' },
						{ id: 'si_two', priceId: 'price_addon', productId: 'prod_addon' },
					],
				}),
			],
			products
		);

		expect(plan).toMatchObject({ action: 'blocked', reason: 'canonical_subscription_must_have_exactly_one_item' });
	});

	it('adds one calendar month without overflowing shorter months', () => {
		expect(addOneCalendarMonth(new Date('2027-01-31T12:30:00.000Z')).toISOString()).toBe(
			'2027-02-28T12:30:00.000Z'
		);
		expect(addOneCalendarMonth(new Date('2028-01-31T12:30:00.000Z')).toISOString()).toBe(
			'2028-02-29T12:30:00.000Z'
		);
	});
});
