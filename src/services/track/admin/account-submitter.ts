import Stripe from 'stripe';
import type { IObserver } from '../types.js';
import { OperationNameEnum } from '../../../types/constants.js';
import type { INotifyMessage } from '../../../types/track.js';
import { EventTracker } from '../tracker.js';
import { StatusCodes } from 'http-status-codes';
import { CustomerService } from '../../api/customer.js';
import type { ISubmitOperation, ISubmitStripeCustomerCreateData } from '../submitter.js';

export class PortalAccountCreateSubmitter implements IObserver {
	private emitter: EventEmitter;
	private stripe: Stripe;

	constructor(emitter: EventEmitter) {
		this.emitter = emitter;
		this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
	}

	notify(notifyMessage: INotifyMessage): void {
		this.emitter.emit('notify', notifyMessage);
	}

	async update(operation: ISubmitOperation): Promise<void> {
		if (operation.operation === OperationNameEnum.STRIPE_ACCOUNT_CREATE) {
			await this.submitStripeAccountCreate(operation);
		}
	}

	async submitStripeAccountCreate(operation: ISubmitOperation): Promise<void> {
		const data = operation.data as ISubmitStripeCustomerCreateData;

		try {
			// Create a new Stripe account
			const account = await this.stripe.customers.create({
				name: data.name,
				email: data.email,
			});
			if (account.lastResponse.statusCode !== StatusCodes.OK) {
				await this.notify({
					message: EventTracker.compileBasicNotification(
						`Failed to create Stripe account with name: ${data.name}.`,
						operation.operation
					),
					severity: 'error',
				} as INotifyMessage);
				return;
			}

			// Update the CaaS customer with the new Stripe account
			await CustomerService.instance.update(data.customerId, undefined, account.id);
			await this.notify({
				message: EventTracker.compileBasicNotification(
					`Stripe account created with name: ${data.name}.`,
					operation.operation
				),
				severity: 'info',
			} as INotifyMessage);
		} catch (error) {
			await this.notify({
				message: EventTracker.compileBasicNotification(
					`Failed to create Stripe account with name: ${data.name as string}.`,
					operation.operation
				),
				severity: 'error',
			} as INotifyMessage);
		}
	}
}
