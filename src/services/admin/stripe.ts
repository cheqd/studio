import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { SubscriptionService } from './subscription.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { EventTracker, eventTracker } from '../track/tracker.js';
import { CustomerService } from '../api/customer.js';
import type { SubscriptionEntity } from '../../database/entities/subscription.entity.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class StripeService {

    private stripeToCustomer: Map<string, CustomerEntity> = new Map();

    async syncFull(): Promise<void> {
        // Set all customers
        await this.setStripeCustomers();
        // Sync all subscriptions
        for await (const subscription of stripe.subscriptions.list()) {
            const current = await SubscriptionService.instance.subscriptionRepository.findOne({
                where: { subscriptionId: subscription.id }
            })
            if (current) {
                await this.updateSubscription(subscription, current);
            }
            else {
                await this.createSubscription(subscription);
            }
        }
        eventTracker.notify({
            message: EventTracker.compileBasicNotification(
                `Subscription syncronization completed`,
                'Subscription syncronization'
            ),
            severity: 'info',
        })
    }

    // Sync all the subscriptions for current customer
    async syncCustomer(customer: CustomerEntity): Promise<void> {
        for await (const subscription of  stripe.subscriptions.list({ 
            customer: customer.stripeCustomerId,
            status: 'all'
        })) {
            const current = await SubscriptionService.instance.subscriptionRepository.findOne({
                where: { subscriptionId: subscription.id }
            })
            if (current) {
                await this.updateSubscription(subscription, current);
            }
            else {
                await this.createSubscription(subscription, customer);
            }
        }
    }

    async setStripeCustomers(): Promise<void> {
        const customers = await CustomerService.instance.customerRepository.createQueryBuilder('customer')
            .select('customer.customerId', 'customer.stripeCustomerId')
            .where('customer.stripeCustomerId IS NOT NULL')
            .getMany();
        customers.forEach((customer) => {
            this.stripeToCustomer.set(customer.stripeCustomerId, customer);
        });
    }

    async isExists(subscriptionId: string): Promise<boolean> {
        const subscriptionEntity = await SubscriptionService.instance.subscriptionRepository.findOne({
            where: { subscriptionId }
        });
        return !!subscriptionEntity;
    }

    async createSubscription(subscription: Stripe.Subscription, customerEntity?: CustomerEntity): Promise<void> {
        const customer = customerEntity 
        ? customerEntity
        : this.stripeToCustomer.get(subscription.customer as string);

        if (!customer) {
            eventTracker.notify({
                message: EventTracker.compileBasicNotification(
                    `Cannot find a customer for subscription with id ${subscription.id}`,
                    'Subscription syncronization'
                ),
                severity: 'error',
            });
            return;
        }
        // Create a new subscription in the database
        const subscriptionEntity = SubscriptionService.instance.create(
            subscription.id,
            customer,
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
            subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined
        );

        // Track the event
        if (!subscriptionEntity) {
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
            })
            return
        }
            
        // Update subscription in the database
        const subscriptionEntity = SubscriptionService.instance.update(
            subscription.id,
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
            subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined
        );

        // Track the event
        if (!subscriptionEntity) {
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

export const stripeService = new StripeService();