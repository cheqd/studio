import { OperationNameEnum } from '../../../types/constants.js';
import type { INotifyMessage } from '../../../types/track.js';
import { SubscriptionService } from '../../admin/subscription.js';
import { CustomerService } from '../../api/customer.js';
import type { ISubmitOperation, ISubmitSubscriptionData } from '../submitter.js';
import { EventTracker, eventTracker } from '../tracker.js';
import type { IObserver } from '../types.js';

//eslint-disable-next-line

function isPromise(object: any): object is Promise<any> {
	return object && Promise.resolve(object) === object;
}

export const eventDecorator = () => {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const { value } = descriptor;
		//eslint-disable-next-line
		descriptor.value = async (...args: any) => {
			try {
				const response = value.apply(target, args);
				return isPromise(response) ? await response : Promise.resolve(response);
			} catch (error) {
				eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						`Error while calling function: ${propertyKey}: ${(error as Record<string, unknown>)?.message || error}`
					),
					severity: 'error',
				} satisfies INotifyMessage);
			}
		};
		return descriptor;
	};
};

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

	// @eventDecorator()
	async submitSubscriptionCreate(operation: ISubmitOperation): Promise<void> {
		const data = operation.data as ISubmitSubscriptionData;
		try {
			const customers = await CustomerService.instance.find({
				stripeCustomerId: data.stripeCustomerId,
			});

			if (customers.length !== 1) {
				this.notify({
					message: EventTracker.compileBasicNotification(
						`It should be only 1 Stripe account associated with CaaS customer. Stripe accountId: ${data.stripeCustomerId}.`,
						operation.operation
					),
					severity: 'error',
				});
			}
			const subscription = await SubscriptionService.instance.create(
				data.subscriptionId,
				customers[0],
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

	// @eventDecorator()
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

	// @eventDecorator()
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
