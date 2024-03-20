import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';
import { SubscriptionEntity } from '../../database/entities/subscription.entity.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { CustomerService } from '../api/customer.js';
import { EventTracker, eventTracker } from '../track/tracker.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class SubscriptionService {
	public subscriptionRepository: Repository<SubscriptionEntity>;

	// Get rid of such code and move it to the builder
	public static instance = new SubscriptionService();

	constructor() {
		this.subscriptionRepository = Connection.instance.dbConnection.getRepository(SubscriptionEntity);
	}

	public async create(
		subscriptionId: string,
		customer: CustomerEntity,
		status: string,
		currentPeriodStart: Date,
		currentPeriodEnd: Date,
		trialStart?: Date,
		trialEnd?: Date
	): Promise<SubscriptionEntity> {
		const subscriptionEntity = new SubscriptionEntity(
			subscriptionId,
			customer,
			status,
			currentPeriodStart,
			currentPeriodEnd,
			trialStart,
			trialEnd
		);
		const res = await this.subscriptionRepository.insert(subscriptionEntity);
		if (!res) throw new Error(`Cannot create a new subscription`);

		return subscriptionEntity;
	}

	public async update(
		subscriptionId: string,
		status?: string,
		currentPeriodStart?: Date,
		currentPeriodEnd?: Date,
		trialStart?: Date,
		trialEnd?: Date
	) {
		const existing = await this.subscriptionRepository.findOneBy({ subscriptionId });
		if (!existing) {
			throw new Error(`Subscription with id ${subscriptionId} not found`);
		}
		if (status) existing.status = status;
		if (currentPeriodStart) existing.currentPeriodStart = currentPeriodStart;
		if (currentPeriodEnd) existing.currentPeriodEnd = currentPeriodEnd;
		if (trialStart) existing.trialStart = trialStart;
		if (trialEnd) existing.trialEnd = trialEnd;
		return await this.subscriptionRepository.save(existing);
	}

	public async get(subscriptionId?: string): Promise<SubscriptionEntity | null> {
		return await this.subscriptionRepository.findOne({
			where: { subscriptionId },
			relations: ['customer'],
		});
	}

	public async findOne(where: Record<string, unknown>) {
		return await this.subscriptionRepository.findOne({
			where: where,
			relations: ['customer'],
		});
	}

	public async stripeSync(customer?: CustomerEntity, user?: UserEntity): Promise<void> {
		let stripeCustomerId: string;
		if (!customer && !user) {
			throw new Error('StripeSync: customer or user is required');
		}
		if (customer) {
			stripeCustomerId = customer.stripeCustomerId;
		} else {
			stripeCustomerId = user?.customer.stripeCustomerId as string;
		}

		// ToDo: add pagination

		const subscriptions = await stripe.subscriptions.list({ 
			customer: stripeCustomerId,
			status: 'all',
			limit: 100,
		});
		// Get list of all subscription and sort them by created time to make sure that we are processing them in the correct order
		for (const subscription of subscriptions.data.sort((a, b) => a.created - b.created)) {
			const existing = await this.subscriptionRepository.findOne({
				where: { subscriptionId: subscription.id },
			});
			if (!existing) {
				const customer = await CustomerService.instance.findbyStripeCustomerId(stripeCustomerId);
				if (!customer) {
					throw new Error(`Customer with stripeCustomerId ${stripeCustomerId} not found`);
				}
				const res = await this.create(
					subscription.id,
					customer,
					subscription.status,
					new Date(subscription.current_period_start * 1000),
					new Date(subscription.current_period_end * 1000),
					subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
					subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined
				);
				if (!res) {
					eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Cannot create a new subscription with id ${subscription.id}`,
							'Subscription syncronization'
						),
						severity: 'error',
					});
				}
				eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						`New subscription with id ${subscription.id} created`,
						'Subscription syncronization'
					),
					severity: 'info',
				});
			} else {
				// ToDo: Update only if there are changes
				const res = await this.update(
					subscription.id,
					subscription.status,
					new Date(subscription.current_period_start * 1000),
					new Date(subscription.current_period_end * 1000),
					subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
					subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined
				);
				if (!res) {
					eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Cannot update subscription with id ${subscription.id}`,
							'Subscription syncronization'
						),
						severity: 'error',
					});
				}
				eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						`Subscription with id ${subscription.id} updated`,
						'Subscription syncronization'
					),
					severity: 'info',
				});
			}
		}
	}
}
