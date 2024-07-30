import Stripe from 'stripe';
import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import { OperationNameEnum } from '../../../types/constants.js';
import type { INotifyMessage } from '../../../types/track.js';
import { SubscriptionService } from '../../admin/subscription.js';
import { CustomerService } from '../../api/customer.js';
import type { ISubmitOperation, ISubmitSubscriptionData } from '../submitter.js';
import { EventTracker } from '../tracker.js';
import type { IObserver } from '../types.js';
import { FindOptionsWhere } from 'typeorm';

export class SubscriptionSubmitter implements IObserver {
	private emitter: EventEmitter;

	constructor(emitter: EventEmitter) {
		this.emitter = emitter;
	}

	notify(notifyMessage: INotifyMessage): void {
		this.emitter.emit('notify', notifyMessage);
	}

	async update(operation: ISubmitOperation): Promise<void> {
		switch (operation.operation) {
			case OperationNameEnum.SUBSCRIPTION_CREATE:
				await this.submitSubscriptionCreate(operation);
				break;

			case OperationNameEnum.SUBSCRIPTION_UPDATE:
				await this.submitSubscriptionUpdate(operation);
				break;

			case OperationNameEnum.SUBSCRIPTION_CANCEL:
				await this.submitSubscriptionCancel(operation);
				break;
		}
	}

	async submitSubscriptionCreate(operation: ISubmitOperation): Promise<void> {
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
		const data = operation.data as ISubmitSubscriptionData;
		let customer: CustomerEntity | undefined = operation.options?.customer;
		try {
			if (!customer) {
				const stripeCustomer = await stripe.customers.retrieve(data.paymentProviderId);

				const whereClause: FindOptionsWhere<CustomerEntity>[] = [{ paymentProviderId: data.paymentProviderId }];
				// we add an additional "OR" check in case that a customer was created locally with email and no paymentProviderId
				if (!stripeCustomer.deleted && stripeCustomer.email) {
					whereClause.push({ email: stripeCustomer.email });
				}

				const customers = await CustomerService.instance.customerRepository.find({
					where: whereClause,
				});

				if (customers.length === 0) {
					this.notify({
						message: EventTracker.compileBasicNotification(
							`Customer not found for Cheqd Studio, creating new customer record with paymentProviderId: ${data.paymentProviderId}`,
							operation.operation
						),
						severity: 'info',
					});

					if (!stripeCustomer.deleted && stripeCustomer.email) {
						const customerName = stripeCustomer.name ?? stripeCustomer.email;
						const customer = await CustomerService.instance.create(
							customerName,
							stripeCustomer.email,
							undefined,
							data.paymentProviderId
						);
						customers.push(customer as CustomerEntity);
					}
				}

				if (customers.length !== 1) {
					this.notify({
						message: EventTracker.compileBasicNotification(
							`Only one Stripe account should be associated with CaaS customer. Stripe accountId: ${data.paymentProviderId}.`,
							operation.operation
						),
						severity: 'error',
					});
				}
				customer = customers[0];
			}

			const subscription = await SubscriptionService.instance.create(
				data.subscriptionId,
				customer,
				data.status,
				data.currentPeriodStart,
				data.currentPeriodEnd,
				data.trialStart as Date,
				data.trialEnd as Date
			);
			if (!subscription) {
				this.notify({
					message: EventTracker.compileBasicNotification(
						`Failed to create a new subscription with id: ${data.subscriptionId}.`,
						operation.operation
					),
					severity: 'error',
				});
			}

			this.notify({
				message: EventTracker.compileBasicNotification(
					`Subscription created with id: ${data.subscriptionId}.`,
					operation.operation
				),
				severity: 'info',
			});
		} catch (error) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Failed to create a new subscription with id: ${data.subscriptionId} because of error: ${(error as Error)?.message || error}`,
					operation.operation
				),
				severity: 'error',
			});
		}
	}

	async submitSubscriptionUpdate(operation: ISubmitOperation): Promise<void> {
		const data = operation.data as ISubmitSubscriptionData;
		try {
			const subscription = await SubscriptionService.instance.update(
				data.subscriptionId,
				data.status,
				data.currentPeriodStart,
				data.currentPeriodEnd,
				data.trialStart as Date,
				data.trialEnd as Date
			);
			if (!subscription) {
				this.notify({
					message: EventTracker.compileBasicNotification(
						`Failed to update subscription with id: ${data.subscriptionId}.`,
						operation.operation
					),
					severity: 'error',
				});
			}

			this.notify({
				message: EventTracker.compileBasicNotification(
					`Subscription updated with id: ${data.subscriptionId}.`,
					operation.operation
				),
				severity: 'info',
			});
		} catch (error) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Failed to update subscription with id: ${data.subscriptionId} because of error: ${(error as Error)?.message || error}`,
					operation.operation
				),
				severity: 'error',
			});
		}
	}

	async submitSubscriptionCancel(operation: ISubmitOperation): Promise<void> {
		const data = operation.data as ISubmitSubscriptionData;
		try {
			const subscription = await SubscriptionService.instance.update(data.subscriptionId, data.status);
			if (!subscription) {
				this.notify({
					message: EventTracker.compileBasicNotification(
						`Failed to cancel subscription with id: ${data.subscriptionId}.`,
						operation.operation
					),
					severity: 'error',
				});
			}

			this.notify({
				message: EventTracker.compileBasicNotification(
					`Subscription canceled with id: ${data.subscriptionId}.`,
					operation.operation
				),
				severity: 'info',
			});
		} catch (error) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Failed to cancel subscription with id: ${data.subscriptionId} because of error: ${(error as Error)?.message || error}`,
					operation.operation
				),
				severity: 'error',
			});
		}
	}
}
