export const CURRENT_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused'] as const;

export type CurrentSubscriptionStatus = (typeof CURRENT_SUBSCRIPTION_STATUSES)[number];
export type MigrationAction = 'update' | 'create' | 'noop' | 'blocked';
export type MigrationTarget = 'basic' | 'build';

export interface MigrationSubscriptionItem {
	id: string;
	priceId: string;
	productId: string;
}

export interface MigrationSubscription {
	id: string;
	customerId: string;
	status: CurrentSubscriptionStatus;
	created: number;
	collectionMethod: 'charge_automatically' | 'send_invoice';
	cancelAtPeriodEnd: boolean;
	hasDiscount: boolean;
	scheduleId?: string;
	items: MigrationSubscriptionItem[];
}

export interface MigrationProducts {
	explorerProductId: string;
	basicProductId: string;
	basicPriceId: string;
	buildProductId: string;
	buildPriceId: string;
}

export interface CustomerMigrationPlan {
	customerId: string;
	action: MigrationAction;
	target: MigrationTarget;
	targetProductId: string;
	targetPriceId: string;
	sourceSubscriptionId: string;
	sourceSubscriptionItemId?: string;
	sourceStatus: CurrentSubscriptionStatus;
	currentProductIds: string[];
	secondarySubscriptionIds: string[];
	clearExistingDiscount: boolean;
	reason: string;
}

export interface MigrationPlanningOptions {
	clearExistingDiscounts?: boolean;
}

const STATUS_RANK: Record<CurrentSubscriptionStatus, number> = {
	active: 0,
	trialing: 1,
	past_due: 2,
	unpaid: 3,
	paused: 4,
};

function targetAffinity(
	subscription: MigrationSubscription,
	target: MigrationTarget,
	products: MigrationProducts
): number {
	const targetProductId = target === 'basic' ? products.basicProductId : products.buildProductId;
	const targetPriceId = target === 'basic' ? products.basicPriceId : products.buildPriceId;

	if (subscription.items.some((item) => item.productId === targetProductId && item.priceId === targetPriceId)) {
		return 0;
	}

	if (subscription.items.some((item) => item.productId === targetProductId)) {
		return 1;
	}

	if (
		target === 'build' &&
		subscription.items.some(
			(item) => item.productId !== products.explorerProductId && item.productId !== products.basicProductId
		)
	) {
		return 2;
	}

	return 3;
}

function selectCanonicalSubscription(
	subscriptions: MigrationSubscription[],
	target: MigrationTarget,
	products: MigrationProducts
): MigrationSubscription {
	return [...subscriptions].sort((left, right) => {
		const affinityDifference = targetAffinity(left, target, products) - targetAffinity(right, target, products);
		if (affinityDifference !== 0) return affinityDifference;

		const statusDifference = STATUS_RANK[left.status] - STATUS_RANK[right.status];
		if (statusDifference !== 0) return statusDifference;

		if (left.created !== right.created) return right.created - left.created;
		return left.id.localeCompare(right.id);
	})[0];
}

export function isCurrentSubscriptionStatus(status: string): status is CurrentSubscriptionStatus {
	return CURRENT_SUBSCRIPTION_STATUSES.some((candidate) => candidate === status);
}

export function addOneCalendarMonth(date: Date): Date {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const day = date.getUTCDate();
	const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();

	return new Date(
		Date.UTC(
			year,
			month + 1,
			Math.min(day, lastDayOfTargetMonth),
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds()
		)
	);
}

export function buildCustomerMigrationPlan(
	subscriptions: MigrationSubscription[],
	products: MigrationProducts,
	options: MigrationPlanningOptions = {}
): CustomerMigrationPlan {
	if (subscriptions.length === 0) {
		throw new Error('At least one current subscription is required');
	}

	const customerIds = new Set(subscriptions.map((subscription) => subscription.customerId));
	if (customerIds.size !== 1) {
		throw new Error('All subscriptions in a customer plan must belong to the same customer');
	}

	const currentProductIds = Array.from(
		new Set(subscriptions.flatMap((subscription) => subscription.items.map((item) => item.productId)))
	).sort();
	const hasNonExplorerPlan = currentProductIds.some(
		(productId) => productId !== products.explorerProductId && productId !== products.basicProductId
	);
	const target: MigrationTarget = hasNonExplorerPlan ? 'build' : 'basic';
	const targetProductId = target === 'basic' ? products.basicProductId : products.buildProductId;
	const targetPriceId = target === 'basic' ? products.basicPriceId : products.buildPriceId;
	const source = selectCanonicalSubscription(subscriptions, target, products);
	const sourceItem = source.items[0];
	const basePlan = {
		customerId: source.customerId,
		target,
		targetProductId,
		targetPriceId,
		sourceSubscriptionId: source.id,
		sourceSubscriptionItemId: sourceItem?.id,
		sourceStatus: source.status,
		currentProductIds,
		secondarySubscriptionIds: subscriptions
			.filter((subscription) => subscription.id !== source.id)
			.map((subscription) => subscription.id)
			.sort(),
		clearExistingDiscount: false,
	};

	if (source.items.length !== 1) {
		return { ...basePlan, action: 'blocked', reason: 'canonical_subscription_must_have_exactly_one_item' };
	}

	if (source.scheduleId) {
		return { ...basePlan, action: 'blocked', reason: 'canonical_subscription_is_managed_by_a_schedule' };
	}

	const alreadyOnTarget = sourceItem.productId === targetProductId && sourceItem.priceId === targetPriceId;
	if (alreadyOnTarget && source.status !== 'paused' && !source.cancelAtPeriodEnd) {
		return { ...basePlan, action: 'noop', reason: 'already_on_target_monthly_price' };
	}

	if (source.hasDiscount && !options.clearExistingDiscounts) {
		return { ...basePlan, action: 'blocked', reason: 'canonical_subscription_has_a_discount' };
	}

	if (source.status === 'paused') {
		return {
			...basePlan,
			action: 'create',
			clearExistingDiscount: source.hasDiscount,
			reason: 'replace_paused_subscription_with_trialing_subscription',
		};
	}

	if (source.collectionMethod !== 'charge_automatically') {
		return { ...basePlan, action: 'blocked', reason: 'canonical_subscription_does_not_charge_automatically' };
	}

	if (source.status === 'unpaid') {
		return { ...basePlan, action: 'blocked', reason: 'canonical_subscription_is_unpaid' };
	}

	return {
		...basePlan,
		action: 'update',
		clearExistingDiscount: source.hasDiscount,
		reason: alreadyOnTarget ? 'remove_scheduled_cancellation_and_start_trial' : 'move_to_target_monthly_price',
	};
}
