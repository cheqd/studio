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

	constructor(emitter: EventEmitter) {
		this.emitter = emitter;
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
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

		try {
			const customer = await CustomerService.instance.customerRepository.findOne({
				where: {
					email: data.email,
				},
			});

			let stripeCustomer: Stripe.Response<Stripe.Customer>;
			if (customer && !customer.paymentProviderId) {
				// Create a new Stripe account
				stripeCustomer = await stripe.customers.create({
					name: data.name,
					email: data.email,
				});
				if (stripeCustomer.lastResponse.statusCode !== StatusCodes.OK) {
					this.notify({
						message: EventTracker.compileBasicNotification(
							`Failed to create Stripe account with name: ${data.name}.`,
							operation.operation
						),
						severity: 'error',
					} as INotifyMessage);
					return;
				}
				this.notify({
					message: EventTracker.compileBasicNotification(
						`Stripe account created with name: ${data.name}.`,
						operation.operation
					),
					severity: 'info',
				} as INotifyMessage);
				// Update the CaaS customer with the new Stripe account. Note, we're populating the "name" field from stripe's response.
				await CustomerService.instance.update({
					customerId: data.customerId,
					name: data.name,
					paymentProviderId: stripeCustomer.id,
				});
			}
		} catch (error) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Failed to create Stripe account with name: ${data.name as string}. Error: ${error}`,
					operation.operation
				),
				severity: 'error',
			} as INotifyMessage);
		}
	}
}
