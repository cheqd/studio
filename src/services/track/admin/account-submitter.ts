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
			//check if stripe account exists by email
			const customer = await stripe.customers.search({
				query: `email:\'${data.email}\'`,
			});
			if (customer.data.length) {
				// if customer already exists don't create one.
				return;
			}
			// Create a new Stripe account
			const account = await stripe.customers.create({
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

			// Update the CaaS customer with the new Stripe account. Note, we're populating the "name" field from stripe's response.
			await CustomerService.instance.update({
				customerId: data.customerId,
				name: data.name,
				paymentProviderId: account.id,
			});
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
					`Failed to create Stripe account with name: ${data.name as string}. Error: ${error}`,
					operation.operation
				),
				severity: 'error',
			} as INotifyMessage);
		}
	}
}
