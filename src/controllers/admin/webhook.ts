import Stripe from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import type { INotifyMessage } from '../../types/track.js';
import { OperationNameEnum } from '../../types/constants.js';
import { buildSubmitOperation } from '../../services/track/helpers.js';

dotenv.config();
export class WebhookController {
	public async handleWebhook(request: Request, response: Response) {
		// Signature verification and webhook handling is placed in the same method
		// cause stripe uses the mthod which validate the signature and provides the event.
		let event = request.body;
		let subscription;
		let status;
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

		if (!process.env.STRIPE_WEBHOOK_SECRET) {
			await eventTracker.notify({
				message: 'Stripe webhook secret not found. Webhook ID: ${request.body.id}.',
				severity: 'error',
			} satisfies INotifyMessage);
			return response.sendStatus(StatusCodes.BAD_REQUEST);
		}

		const signature = request.headers['stripe-signature'];
		if (!signature) {
			await eventTracker.notify({
				message: 'Webhook signature not found. Webhook ID: ${request.body.id}.',
				severity: 'error',
			} satisfies INotifyMessage);
			return response.sendStatus(StatusCodes.BAD_REQUEST);
		}

		try {
			event = stripe.webhooks.constructEvent(request.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
		} catch (err) {
			await eventTracker.notify({
				message: `Webhook signature verification failed. Webhook ID: ${request.body.id}. Error: ${(err as Record<string, unknown>)?.message || err}`,
				severity: 'error',
			} satisfies INotifyMessage);
			return response.sendStatus(StatusCodes.BAD_REQUEST);
		}

		try {
			// Handle the event
			switch (event.type) {
				case 'customer.subscription.trial_will_end':
					subscription = event.data.object;
					status = subscription.status;
					await eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Subscription status is ${status} for subscription with id: ${subscription.id}`,
							'Stripe Webhook: customer.subscription.trial_will_end'
						),
						severity: 'info',
					} satisfies INotifyMessage);
					await eventTracker.submit(
						buildSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_TRIAL_WILL_END)
					);
					break;
				case 'customer.subscription.deleted':
					subscription = event.data.object;
					status = subscription.status;
					await eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Subscription status is ${status} for subscription with id: ${subscription.id}`,
							'Stripe Webhook: customer.subscription.deleted'
						),
						severity: 'info',
					} satisfies INotifyMessage);
					await eventTracker.submit(
						buildSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_CANCEL)
					);
					break;
				case 'customer.subscription.created':
					subscription = event.data.object;
					status = subscription.status;
					await eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Subscription status is ${status} for subscription with id: ${subscription.id}`,
							'Stripe Webhook: customer.subscription.created'
						),
						severity: 'info',
					} satisfies INotifyMessage);
					await eventTracker.submit(
						buildSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_CREATE)
					);
					break;
				case 'customer.subscription.updated':
					subscription = event.data.object;
					status = subscription.status;
					await eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Subscription status is ${status} for subscription with id: ${subscription.id}`,
							'Stripe Webhook: customer.subscription.updated'
						),
						severity: 'info',
					} satisfies INotifyMessage);
					await eventTracker.submit(
						buildSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_UPDATE)
					);
					break;
				default:
					// Unexpected event type
					await eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							`Unexpected event: ${event} with type: ${event?.type}`,
							'Stripe Webhook: unexpected'
						),
						severity: 'error',
					} satisfies INotifyMessage);
			}
			// Return a 200 response to acknowledge receipt of the event
			return response.status(StatusCodes.OK).send();
		} catch (error) {
			// Unexpected event type
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Webhook failed: ${event} with type: ${event?.type}`,
					'Stripe Webhook: unexpected'
				),
				severity: 'error',
			} satisfies INotifyMessage);

			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
