import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { SubscriptionService } from './subscription.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { EventTracker, eventTracker } from '../track/tracker.js';
import type { SubscriptionEntity } from '../../database/entities/subscription.entity.js';
import type { NextFunction } from 'express';
import { WebhookController } from '../../controllers/admin/webhook.js';

dotenv.config();

export class StripeService {
	private isFullySynced = false;

	async syncAll(next: NextFunction): Promise<void> {
		if (!this.isFullySynced) {
			await this.syncFull();
			this.isFullySynced = true;
		}
		next();
	}

	async syncFull(): Promise<void> {
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
		// Sync all subscriptions
		for await (const subscription of stripe.subscriptions.list({
			status: 'all',
		})) {
			const current = await SubscriptionService.instance.subscriptionRepository.findOne({
				where: { subscriptionId: subscription.id },
			});
			if (current) {
				await this.updateSubscription(subscription, current);
			} else {
				await this.createSubscription(subscription);
			}
		}
		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription synchronization completed`,
				'Subscription synchronization'
			),
			severity: 'info',
		});
	}

	// Sync all the subscriptions for current customer
	async syncCustomer(customer: CustomerEntity): Promise<void> {
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
		for await (const subscription of stripe.subscriptions.list({
			customer: customer.paymentProviderId,
			status: 'all',
		})) {
			const current = await SubscriptionService.instance.subscriptionRepository.findOne({
				where: { subscriptionId: subscription.id },
			});
			if (current) {
				await this.updateSubscription(subscription, current);
			} else {
				await this.createSubscription(subscription, customer);
			}
		}
	}

	async syncOne(customer: CustomerEntity): Promise<void> {
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

		const local = await SubscriptionService.instance.findCurrent(customer);
		if (!local) {
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Active subscription not found for customer with id ${customer.customerId}`,
					'Subscription synchronization'
				),
				severity: 'debug',
			});
			const activeSubs = await stripe.subscriptions.list({
				customer: customer.paymentProviderId,
				status: 'active',
			});
			const trialSubs = await stripe.subscriptions.list({
				customer: customer.paymentProviderId,
				status: 'trialing',
			});
			const subs = [...activeSubs.data, ...trialSubs.data];
			if (subs.length > 1) {
				await eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						`Multiple active subscriptions found for customer with id ${customer.customerId}`,
						'Subscription synchronization'
					),
					severity: 'error',
				});
				return;
			}
			if (subs.length > 0) {
				await this.createSubscription(subs[0], customer);
			}
			return;
		}
		const subscriptionId = local.subscriptionId;
		const remote = await stripe.subscriptions.retrieve(subscriptionId);
		if (!remote) {
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Subscription with id ${subscriptionId} could not be retrieved from Stripe`,
					'Subscription synchronization'
				),
				severity: 'error',
			});
			return;
		}
		const current = await SubscriptionService.instance.subscriptionRepository.findOne({
			where: { subscriptionId: remote.id },
		});
		if (current) {
			await this.updateSubscription(remote, current);
		} else {
			await this.createSubscription(remote);
		}
	}

	async createSubscription(subscription: Stripe.Subscription, customer?: CustomerEntity): Promise<void> {
		await WebhookController.instance.handleSubscriptionCreate(subscription, customer);
	}

	async updateSubscription(subscription: Stripe.Subscription, current: SubscriptionEntity): Promise<void> {
		// Update only if there are changes
		if (SubscriptionService.instance.equals(current, subscription)) {
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Subscription with id ${subscription.id} has no changes`,
					'Subscription synchronization'
				),
				severity: 'debug',
			});
			return;
		}
		await WebhookController.instance.handleSubscriptionUpdate(subscription);
	}
}

export const stripeService = new StripeService();
