import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { SubscriptionService } from './subscription.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { EventTracker, eventTracker } from '../track/tracker.js';
import type { SubscriptionEntity } from '../../database/entities/subscription.entity.js';
import { builSubmitOperation } from '../track/helpers.js';
import { OperationNameEnum } from '../../types/constants.js';
import { SubscriptionSubmitter } from '../track/admin/subscription-submitter.js';

dotenv.config();

export class StripeService {

    submitter: SubscriptionSubmitter;

    constructor() {
        this.submitter = new SubscriptionSubmitter(eventTracker.getEmitter());
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
		eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription syncronization completed`,
				'Subscription syncronization'
			),
			severity: 'info',
		});
	}

	// Sync all the subscriptions for current customer
	async syncCustomer(customer: CustomerEntity): Promise<void> {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
		for await (const subscription of stripe.subscriptions.list({
			customer: customer.stripeCustomerId,
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

	async createSubscription(subscription: Stripe.Subscription, customer?: CustomerEntity): Promise<void> {
		await this.submitter.submitSubscriptionCreate(builSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_CREATE, {customer: customer}));
	}

	async updateSubscription(subscription: Stripe.Subscription, current: SubscriptionEntity): Promise<void> {
		// Update only if there are changes
		if (SubscriptionService.instance.equals(current, subscription)) {
			eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Subscription with id ${subscription.id} has no changes`,
					'Subscription syncronization'
				),
				severity: 'debug',
			});
			return;
		}
		await this.submitter.submitSubscriptionUpdate(builSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_UPDATE));
	}
}

export const stripeService = new StripeService();
