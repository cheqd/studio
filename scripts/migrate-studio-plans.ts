#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import type Stripe from 'stripe';
import type {
	CustomerMigrationPlan,
	MigrationProducts,
	MigrationSubscription,
} from '../src/services/admin/subscription-migration-plan.js';

const DEFAULT_BASIC_PRODUCT_ID = 'prod_VBtyPtZjlTFc78';
const DEFAULT_EXPLORER_PRODUCT_ID = 'prod_TUNNqwEMASw6Uu';
const EXECUTION_CONFIRMATION = 'APPLY_STUDIO_PLAN_MIGRATION';
const EXPECTED_BASIC_MONTHLY_AMOUNT = 2_000;
const EXPECTED_BUILD_MONTHLY_AMOUNT = 9_900;
const CONCURRENCY = 8;

interface CliOptions {
	mode: 'dry-run' | 'execute';
	envFile: string;
	expectedAccountId?: string;
	confirmation?: string;
	customerIds: string[];
	clearExistingDiscounts: boolean;
	help: boolean;
}

interface PlanPrice {
	product: Stripe.Product;
	price: Stripe.Price;
}

interface CustomerContext {
	customerId: string;
	email?: string;
	deleted: boolean;
	hasDefaultPaymentMethod: boolean;
	error?: string;
}

interface EnrichedPlan extends CustomerMigrationPlan {
	email?: string;
	hasDefaultPaymentMethod: boolean;
	customerLookupError?: string;
}

interface AuditEntry {
	timestamp: string;
	sequence: number;
	level: 'info' | 'warning' | 'error';
	event: string;
	details: Record<string, unknown>;
}

class AuditLog {
	private readonly entries: AuditEntry[] = [];
	private sequence = 0;

	public constructor(private readonly outputPath: string) {}

	public record(level: AuditEntry['level'], event: string, details: Record<string, unknown> = {}): void {
		this.entries.push({
			timestamp: new Date().toISOString(),
			sequence: this.sequence++,
			level,
			event,
			details,
		});
	}

	public flush(): string {
		mkdirSync(dirname(this.outputPath), { recursive: true });
		const orderedEntries = [...this.entries].sort((left, right) => {
			const timestampDifference = left.timestamp.localeCompare(right.timestamp);
			return timestampDifference === 0 ? left.sequence - right.sequence : timestampDifference;
		});
		writeFileSync(this.outputPath, `${orderedEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
		return this.outputPath;
	}
}

function readOptionValue(argumentsList: string[], index: number, option: string): string {
	const value = argumentsList[index + 1];
	if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
	return value;
}

function parseArguments(argumentsList: string[]): CliOptions {
	const options: CliOptions = {
		mode: 'dry-run',
		envFile: '.env.production',
		customerIds: [],
		clearExistingDiscounts: false,
		help: false,
	};
	let modeWasSet = false;

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		switch (argument) {
			case '--dry-run':
				if (modeWasSet && options.mode !== 'dry-run') throw new Error('Choose either --dry-run or --execute');
				options.mode = 'dry-run';
				modeWasSet = true;
				break;
			case '--execute':
				if (modeWasSet && options.mode !== 'execute') throw new Error('Choose either --dry-run or --execute');
				options.mode = 'execute';
				modeWasSet = true;
				break;
			case '--env-file':
				options.envFile = readOptionValue(argumentsList, index, argument);
				index += 1;
				break;
			case '--expected-account':
				options.expectedAccountId = readOptionValue(argumentsList, index, argument);
				index += 1;
				break;
			case '--confirm':
				options.confirmation = readOptionValue(argumentsList, index, argument);
				index += 1;
				break;
			case '--customer':
				options.customerIds.push(readOptionValue(argumentsList, index, argument));
				index += 1;
				break;
			case '--clear-existing-discounts':
				options.clearExistingDiscounts = true;
				break;
			case '--help':
			case '-h':
				options.help = true;
				break;
			default:
				throw new Error(`Unknown option: ${argument}`);
		}
	}
	if (options.clearExistingDiscounts && options.customerIds.length === 0) {
		throw new Error('--clear-existing-discounts requires at least one explicit --customer ID');
	}

	return options;
}

function printUsage(): void {
	console.log(`Usage:
  npm run migrate:stripe-plans -- --dry-run
  npm run migrate:stripe-plans -- --execute --expected-account acct_... --confirm ${EXECUTION_CONFIRMATION}

Options:
  --dry-run                 Build and log the complete plan without mutations (default)
  --execute                 Apply the planned Stripe mutations
  --env-file PATH           Environment file to load (default: .env.production)
  --expected-account ID     Required account guard for production execution
  --confirm TOKEN           Required execution token: ${EXECUTION_CONFIRMATION}
  --customer ID             Limit to one customer; may be repeated for a canary batch
  --clear-existing-discounts
                            Remove discounts for explicitly listed --customer IDs only
  --help                    Show this help`);
}

function formatRunTimestamp(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');
}

function getObjectId(value: string | { id: string } | null | undefined): string | undefined {
	if (!value) return undefined;
	return typeof value === 'string' ? value : value.id;
}

function getProductId(product: string | Stripe.Product | Stripe.DeletedProduct): string {
	return typeof product === 'string' ? product : product.id;
}

function getCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
	return typeof customer === 'string' ? customer : customer.id;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function hasPaymentReference(value: unknown): boolean {
	return typeof value === 'string' ? value.length > 0 : Boolean(value && typeof value === 'object' && 'id' in value);
}

async function mapWithConcurrency<T, TResult>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<TResult>
): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(items[currentIndex]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
	return results;
}

async function retrieveTargetPlan(
	stripe: Stripe,
	productId: string,
	expectedAmount: number,
	label: string
): Promise<PlanPrice> {
	const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
	if (!product.active) throw new Error(`${label} product ${productId} is not active`);

	const defaultPriceId = getObjectId(product.default_price);
	if (!defaultPriceId) throw new Error(`${label} product ${productId} has no default price`);
	const price =
		typeof product.default_price === 'object' && product.default_price?.object === 'price'
			? product.default_price
			: await stripe.prices.retrieve(defaultPriceId);

	if (!price.active) throw new Error(`${label} default price ${price.id} is not active`);
	if (getProductId(price.product) !== product.id)
		throw new Error(`${label} default price belongs to another product`);
	if (price.currency !== 'usd' || price.unit_amount !== expectedAmount) {
		throw new Error(
			`${label} default price must be USD ${expectedAmount / 100} but is ${price.currency} ${price.unit_amount}`
		);
	}
	if (price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) {
		throw new Error(`${label} default price ${price.id} must recur monthly`);
	}

	return { product, price };
}

function toMigrationSubscription(subscription: Stripe.Subscription): MigrationSubscription | undefined {
	const { isCurrentSubscriptionStatus } = migrationPlanning;
	if (!isCurrentSubscriptionStatus(subscription.status)) return undefined;

	const items = subscription.items.data.map((item) => ({
		id: item.id,
		priceId: item.price.id,
		productId: getProductId(item.price.product),
	}));
	if (subscription.items.has_more) {
		items.push({ id: 'unloaded_item', priceId: 'unloaded_price', productId: 'unloaded_product' });
	}

	return {
		id: subscription.id,
		customerId: getCustomerId(subscription.customer),
		status: subscription.status,
		created: subscription.created,
		collectionMethod: subscription.collection_method,
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		hasDiscount: Boolean(subscription.discount),
		scheduleId: getObjectId(subscription.schedule),
		items,
	};
}

async function retrieveCustomerContext(
	stripe: Stripe,
	plan: CustomerMigrationPlan,
	sourceSubscription: Stripe.Subscription
): Promise<CustomerContext> {
	try {
		const customer =
			typeof sourceSubscription.customer === 'string'
				? await stripe.customers.retrieve(plan.customerId)
				: sourceSubscription.customer;
		if (customer.deleted) {
			return {
				customerId: plan.customerId,
				deleted: true,
				hasDefaultPaymentMethod: false,
			};
		}

		return {
			customerId: plan.customerId,
			email: customer.email || undefined,
			deleted: false,
			hasDefaultPaymentMethod:
				hasPaymentReference(sourceSubscription.default_payment_method) ||
				hasPaymentReference(sourceSubscription.default_source) ||
				hasPaymentReference(customer.invoice_settings.default_payment_method) ||
				hasPaymentReference(customer.default_source),
		};
	} catch (error) {
		return {
			customerId: plan.customerId,
			deleted: false,
			hasDefaultPaymentMethod: false,
			error: errorMessage(error),
		};
	}
}

function enrichPlan(plan: CustomerMigrationPlan, customer: CustomerContext): EnrichedPlan {
	const basePlan = {
		...plan,
		email: customer.email,
		hasDefaultPaymentMethod: customer.hasDefaultPaymentMethod,
		customerLookupError: customer.error,
	};

	if (plan.action === 'noop' || plan.action === 'blocked') return basePlan;
	if (customer.error) return { ...basePlan, action: 'blocked', reason: 'stripe_customer_lookup_failed' };
	if (customer.deleted) return { ...basePlan, action: 'blocked', reason: 'stripe_customer_is_deleted' };
	return basePlan;
}

function summarize(plans: EnrichedPlan[]): Record<string, number> {
	const affected = plans.filter((plan) => plan.action === 'update' || plan.action === 'create');
	const requiringMigration = plans.filter((plan) => plan.action !== 'noop');
	return {
		customersEvaluated: plans.length,
		customersRequiringMigration: requiringMigration.length,
		affectedCustomers: affected.length,
		basicCustomersRequiringMigration: requiringMigration.filter((plan) => plan.target === 'basic').length,
		buildCustomersRequiringMigration: requiringMigration.filter((plan) => plan.target === 'build').length,
		basicCustomersAffected: affected.filter((plan) => plan.target === 'basic').length,
		buildCustomersAffected: affected.filter((plan) => plan.target === 'build').length,
		subscriptionsUpdated: affected.filter((plan) => plan.action === 'update').length,
		subscriptionsCreated: affected.filter((plan) => plan.action === 'create').length,
		alreadyOnTarget: plans.filter((plan) => plan.action === 'noop').length,
		blocked: plans.filter((plan) => plan.action === 'blocked').length,
		blockedByExistingDiscount: plans.filter(
			(plan) => plan.action === 'blocked' && plan.reason === 'canonical_subscription_has_a_discount'
		).length,
		affectedWithDefaultPaymentMethod: affected.filter((plan) => plan.hasDefaultPaymentMethod).length,
		affectedWithoutDefaultPaymentMethod: affected.filter((plan) => !plan.hasDefaultPaymentMethod).length,
		customersWithOverlappingCurrentSubscriptions: plans.filter((plan) => plan.secondarySubscriptionIds.length > 0)
			.length,
	};
}

function printSummary(
	mode: CliOptions['mode'],
	accountId: string,
	trialEnd: Date,
	summary: Record<string, number>,
	terminalSubscriptionsIgnored: number
): void {
	console.log('');
	console.log('Studio Stripe plan migration');
	console.log(`Mode: ${mode === 'dry-run' ? 'DRY RUN (no mutations)' : 'EXECUTE'}`);
	console.log(`Stripe account: ${accountId}`);
	console.log(`Trial end for moved customers: ${trialEnd.toISOString()} (one calendar month)`);
	console.log(`Customers evaluated: ${summary.customersEvaluated}`);
	console.log(`Customers requiring migration: ${summary.customersRequiringMigration}`);
	console.log(`  Basic target: ${summary.basicCustomersRequiringMigration}`);
	console.log(`  Build target: ${summary.buildCustomersRequiringMigration}`);
	console.log(`Ready to migrate: ${summary.affectedCustomers}`);
	console.log(`  Explorer/new Basic -> Basic: ${summary.basicCustomersAffected}`);
	console.log(`  Other products -> Build: ${summary.buildCustomersAffected}`);
	console.log(`  Existing subscriptions to update: ${summary.subscriptionsUpdated}`);
	console.log(`  Paused subscriptions needing a new trialing subscription: ${summary.subscriptionsCreated}`);
	console.log(`Already on the target monthly price: ${summary.alreadyOnTarget}`);
	console.log(`Blocked: ${summary.blocked}`);
	console.log(`  Blocked by an existing discount: ${summary.blockedByExistingDiscount}`);
	console.log(`Affected with a default payment method: ${summary.affectedWithDefaultPaymentMethod}`);
	console.log(`Affected without a default payment method: ${summary.affectedWithoutDefaultPaymentMethod}`);
	console.log(
		`Customers with overlapping current subscriptions: ${summary.customersWithOverlappingCurrentSubscriptions}`
	);
	console.log(`Canceled/expired historical subscriptions ignored: ${terminalSubscriptionsIgnored}`);
	console.log('');
}

function assertExecutionPreflight(
	options: CliOptions,
	accountId: string,
	plans: EnrichedPlan[],
	basicPlan: PlanPrice,
	buildPlan: PlanPrice
): void {
	if (options.mode !== 'execute') return;
	const expectedAccountId = options.expectedAccountId || process.env.STRIPE_MIGRATION_EXPECTED_ACCOUNT_ID;
	if (!expectedAccountId) throw new Error('--expected-account or STRIPE_MIGRATION_EXPECTED_ACCOUNT_ID is required');
	if (expectedAccountId !== accountId) {
		throw new Error(`Stripe account guard failed: expected ${expectedAccountId}, connected to ${accountId}`);
	}
	if (options.confirmation !== EXECUTION_CONFIRMATION) {
		throw new Error(`--confirm ${EXECUTION_CONFIRMATION} is required`);
	}
	if (
		!basicPlan.product.livemode ||
		!basicPlan.price.livemode ||
		!buildPlan.product.livemode ||
		!buildPlan.price.livemode
	) {
		throw new Error('Execution requires live-mode Basic and Build products and prices');
	}
	if (plans.some((plan) => plan.action === 'blocked')) {
		throw new Error('Execution stopped because one or more customer plans are blocked; inspect the dry-run log');
	}
}

function verifyMutation(subscription: Stripe.Subscription, plan: EnrichedPlan, trialEndUnix: number): void {
	if (subscription.status !== 'trialing') {
		throw new Error(`Subscription ${subscription.id} returned status ${subscription.status}, expected trialing`);
	}
	if (subscription.trial_end !== trialEndUnix) {
		throw new Error(`Subscription ${subscription.id} returned an unexpected trial_end`);
	}
	if (subscription.items.data.length !== 1 || subscription.items.data[0].price.id !== plan.targetPriceId) {
		throw new Error(`Subscription ${subscription.id} did not return the target price ${plan.targetPriceId}`);
	}
}

async function executePlan(stripe: Stripe, plans: EnrichedPlan[], trialEnd: Date, auditLog: AuditLog): Promise<number> {
	const trialEndUnix = Math.floor(trialEnd.getTime() / 1000);
	let failures = 0;

	for (const plan of plans) {
		if (plan.action !== 'update' && plan.action !== 'create') continue;

		auditLog.record('info', 'mutation_started', {
			customerId: plan.customerId,
			sourceSubscriptionId: plan.sourceSubscriptionId,
			action: plan.action,
			target: plan.target,
			targetPriceId: plan.targetPriceId,
		});

		try {
			const idempotencyKey = [
				'studio-plan-migration-v1',
				plan.action,
				plan.sourceSubscriptionId,
				plan.targetPriceId,
				trialEndUnix,
			].join(':');
			let result: Stripe.Subscription;

			if (plan.action === 'update') {
				if (!plan.sourceSubscriptionItemId) throw new Error('Source subscription item ID is missing');
				result = await stripe.subscriptions.update(
					plan.sourceSubscriptionId,
					{
						items: [{ id: plan.sourceSubscriptionItemId, price: plan.targetPriceId }],
						proration_behavior: 'none',
						trial_end: trialEndUnix,
						trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
						cancel_at_period_end: false,
						...(plan.clearExistingDiscount ? { coupon: '' } : {}),
						metadata: {
							studio_plan_migration: 'explorer-basic-build-v1',
							studio_plan_target: plan.target,
							studio_plan_migrated_at: new Date().toISOString(),
						},
					},
					{ idempotencyKey }
				);
			} else {
				result = await stripe.subscriptions.create(
					{
						customer: plan.customerId,
						items: [{ price: plan.targetPriceId }],
						collection_method: 'charge_automatically',
						trial_end: trialEndUnix,
						trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
						payment_settings: { save_default_payment_method: 'on_subscription' },
						metadata: {
							studio_plan_migration: 'explorer-basic-build-v1',
							studio_plan_target: plan.target,
							studio_plan_source_subscription: plan.sourceSubscriptionId,
							studio_plan_migrated_at: new Date().toISOString(),
						},
					},
					{ idempotencyKey }
				);
			}

			verifyMutation(result, plan, trialEndUnix);
			auditLog.record('info', 'mutation_succeeded', {
				customerId: plan.customerId,
				sourceSubscriptionId: plan.sourceSubscriptionId,
				resultSubscriptionId: result.id,
				target: plan.target,
				targetPriceId: plan.targetPriceId,
				trialEnd: result.trial_end,
			});
		} catch (error) {
			failures += 1;
			auditLog.record('error', 'mutation_failed', {
				customerId: plan.customerId,
				sourceSubscriptionId: plan.sourceSubscriptionId,
				error: errorMessage(error),
			});
			console.error(`Migration failed for ${plan.customerId}: ${errorMessage(error)}`);
		}
	}

	return failures;
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
	printUsage();
	process.exit(0);
}

const envPath = resolve(process.cwd(), options.envFile);
if (!existsSync(envPath)) throw new Error(`Environment file not found: ${envPath}`);
const envResult = loadEnvironment({ path: envPath, override: true });
if (envResult.error) throw envResult.error;

const migrationPlanning = await import('../src/services/admin/subscription-migration-plan.js');
const { default: StripeClient } = await import('stripe');
const startedAt = new Date();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
	scriptDirectory,
	'output',
	`studio-plan-migration-${formatRunTimestamp(startedAt)}-${options.mode}.jsonl`
);
const auditLog = new AuditLog(outputPath);

async function run(): Promise<void> {
	const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
	if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is required');

	const basicProductId = process.env.STRIPE_BASIC_PLAN_ID || DEFAULT_BASIC_PRODUCT_ID;
	const buildProductId = process.env.STRIPE_BUILD_PLAN_ID;
	const explorerProductId = process.env.STRIPE_EXPLORER_PLAN_ID || DEFAULT_EXPLORER_PRODUCT_ID;
	if (!buildProductId) throw new Error('STRIPE_BUILD_PLAN_ID is required');

	const stripe = new StripeClient(stripeSecretKey, { maxNetworkRetries: 2 });
	const account = await stripe.accounts.retrieve();
	const [basicPlan, buildPlan, explorerProduct] = await Promise.all([
		retrieveTargetPlan(stripe, basicProductId, EXPECTED_BASIC_MONTHLY_AMOUNT, 'Basic'),
		retrieveTargetPlan(stripe, buildProductId, EXPECTED_BUILD_MONTHLY_AMOUNT, 'Build'),
		stripe.products.retrieve(explorerProductId),
	]);
	if (!explorerProduct.active) throw new Error(`Explorer product ${explorerProductId} is not active`);

	const products: MigrationProducts = {
		explorerProductId,
		basicProductId: basicPlan.product.id,
		basicPriceId: basicPlan.price.id,
		buildProductId: buildPlan.product.id,
		buildPriceId: buildPlan.price.id,
	};
	const stripeSubscriptions: Stripe.Subscription[] = [];
	for await (const subscription of stripe.subscriptions.list({
		status: 'all',
		limit: 100,
		expand: ['data.customer'],
	})) {
		stripeSubscriptions.push(subscription);
	}

	const sourceSubscriptions = new Map(stripeSubscriptions.map((subscription) => [subscription.id, subscription]));
	const currentSubscriptions = stripeSubscriptions
		.map(toMigrationSubscription)
		.filter((subscription): subscription is MigrationSubscription => Boolean(subscription));
	const subscriptionsByCustomer = new Map<string, MigrationSubscription[]>();
	for (const subscription of currentSubscriptions) {
		const existing = subscriptionsByCustomer.get(subscription.customerId) || [];
		existing.push(subscription);
		subscriptionsByCustomer.set(subscription.customerId, existing);
	}

	let customerPlans = Array.from(subscriptionsByCustomer.values()).map((subscriptions) =>
		migrationPlanning.buildCustomerMigrationPlan(subscriptions, products, {
			clearExistingDiscounts: options.clearExistingDiscounts,
		})
	);
	if (options.customerIds.length > 0) {
		const requestedCustomerIds = new Set(options.customerIds);
		customerPlans = customerPlans.filter((plan) => requestedCustomerIds.has(plan.customerId));
		const foundCustomerIds = new Set(customerPlans.map((plan) => plan.customerId));
		const missingCustomerIds = options.customerIds.filter((customerId) => !foundCustomerIds.has(customerId));
		if (missingCustomerIds.length > 0) {
			throw new Error(
				`No current subscription found for requested customer(s): ${missingCustomerIds.join(', ')}`
			);
		}
	}
	customerPlans.sort((left, right) => left.customerId.localeCompare(right.customerId));

	const customerContexts = await mapWithConcurrency(customerPlans, CONCURRENCY, async (plan) => {
		const sourceSubscription = sourceSubscriptions.get(plan.sourceSubscriptionId);
		if (!sourceSubscription) throw new Error(`Source subscription ${plan.sourceSubscriptionId} was not loaded`);
		return retrieveCustomerContext(stripe, plan, sourceSubscription);
	});
	const contextsByCustomer = new Map(customerContexts.map((context) => [context.customerId, context]));
	const plans = customerPlans.map((plan) => {
		const context = contextsByCustomer.get(plan.customerId);
		if (!context) throw new Error(`Customer context ${plan.customerId} was not loaded`);
		return enrichPlan(plan, context);
	});
	const trialEnd = migrationPlanning.addOneCalendarMonth(startedAt);
	const summary = summarize(plans);
	const terminalSubscriptionsIgnored = stripeSubscriptions.length - currentSubscriptions.length;

	auditLog.record('info', 'preflight_completed', {
		mode: options.mode,
		environmentFile: basename(envPath),
		stripeAccountId: account.id,
		basicProductId: products.basicProductId,
		basicPriceId: products.basicPriceId,
		buildProductId: products.buildProductId,
		buildPriceId: products.buildPriceId,
		explorerProductId: products.explorerProductId,
		trialEnd: trialEnd.toISOString(),
		clearExistingDiscounts: options.clearExistingDiscounts,
		terminalSubscriptionsIgnored,
		...summary,
	});
	for (const plan of plans) {
		auditLog.record(plan.action === 'blocked' ? 'warning' : 'info', 'customer_plan', { ...plan });
	}

	printSummary(options.mode, account.id, trialEnd, summary, terminalSubscriptionsIgnored);
	assertExecutionPreflight(options, account.id, plans, basicPlan, buildPlan);

	if (options.mode === 'dry-run') {
		console.log('Dry run complete. No Stripe objects were changed.');
		return;
	}

	const failures = await executePlan(stripe, plans, trialEnd, auditLog);
	auditLog.record(failures === 0 ? 'info' : 'error', 'execution_completed', {
		attempted: summary.affectedCustomers,
		succeeded: summary.affectedCustomers - failures,
		failed: failures,
	});
	console.log(`Execution complete: ${summary.affectedCustomers - failures} succeeded, ${failures} failed.`);
	if (failures > 0) process.exitCode = 1;
}

try {
	auditLog.record('info', 'run_started', { mode: options.mode, environmentFile: basename(envPath) });
	await run();
} catch (error) {
	auditLog.record('error', 'run_failed', { error: errorMessage(error) });
	console.error(`Migration stopped: ${errorMessage(error)}`);
	process.exitCode = 1;
} finally {
	console.log(`Time-ordered audit log: ${auditLog.flush()}`);
}
