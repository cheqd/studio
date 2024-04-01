import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';
import { SubscriptionEntity } from '../../database/entities/subscription.entity.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type Stripe from 'stripe';

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

	public async findCurrent(customer: CustomerEntity) {
		return await this.subscriptionRepository.findOne({
			where: [
				{ customer: customer, status: 'active' },
				{ customer: customer, status: 'trialing' },
			],
			relations: ['customer'],
		});
	}

	public equals(subscriptionEntity: SubscriptionEntity, subscription: Stripe.Subscription): boolean {
		const required =
			subscriptionEntity.subscriptionId === subscription.id &&
			subscriptionEntity.status === subscription.status &&
			subscriptionEntity.currentPeriodStart.getTime() === subscription.current_period_start * 1000 &&
			subscriptionEntity.currentPeriodEnd.getTime() === subscription.current_period_end * 1000;
		if (!required) return false;
		// Check trial dates only if they are present in the subscription
		if (subscription.trial_start) {
			if (
				!subscriptionEntity.trialStart ||
				subscriptionEntity.trialStart.getTime() !== subscription.trial_start * 1000
			)
				return false;
		}
		if (subscription.trial_end) {
			if (!subscriptionEntity.trialEnd || subscriptionEntity.trialEnd.getTime() !== subscription.trial_end * 1000)
				return false;
		}
		return true;
	}
}
