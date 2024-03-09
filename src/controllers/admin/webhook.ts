import Stripe from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import type { INotifyMessage } from '../../types/track.js';
import { OperationNameEnum } from '../../types/constants.js';
import type { ISubmitOperation, ISubmitData } from '../../services/track/submitter.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export class WebhookController {
    public async handleWebhook(request: Request, response: Response) {
        let event = request.body;
        let subscription;
        let status;
        const builSubmitOperation = ( function(subscription: Stripe.Subscription, name: string) {
            return {
                operation: name,
                data: {
                    subscriptionId: subscription.id,
                    stripeCustomerId: subscription.customer as string,
                    status: subscription.status,
                    currentPeriodStart: new Date(subscription.current_period_start * 1000),
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
                    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
                } satisfies ISubmitData,
            } satisfies ISubmitOperation;
        })
        // Only verify the event if you have an endpoint secret defined.
        // Otherwise use the basic event deserialized with JSON.parse
        // Get the signature sent by Stripe

        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            await eventTracker.notify({
                message: 'Stripe webhook secret not found. Webhook ID: ${request.body.id}.',
                severity: 'error',
            } satisfies INotifyMessage)
            return response.sendStatus(StatusCodes.BAD_REQUEST);
        }

        const signature = request.headers['stripe-signature'];
        if (!signature) {
            await eventTracker.notify({
                message: 'Webhook signature not found. Webhook ID: ${request.body.id}.',
                severity: 'error',
            } satisfies INotifyMessage)
            return response.sendStatus(StatusCodes.BAD_REQUEST);
        }

        try {
            event = stripe.webhooks.constructEvent(
            request.rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {

            await eventTracker.notify({
                message: `Webhook signature verification failed. Webhook ID: ${request.body.id}. Error: ${(err as Record<string, unknown>)?.message || err}`,
                severity: 'error',
            } satisfies INotifyMessage)
            return response.sendStatus(StatusCodes.BAD_REQUEST);
        }
        // Handle the event
        switch (event.type) {
        case 'customer.subscription.trial_will_end':
            subscription = event.data.object;
            status = subscription.status;
            await eventTracker.notify({
                message: EventTracker.compileBasicNotification(`Subscription status is ${status} for subscription with id: ${subscription.id}`, 'Stripe Webhook: customer.subscription.trial_will_end'),
                severity: 'info',
            } satisfies INotifyMessage)
            await eventTracker.submit(builSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_TRIAL_WILL_END));
            break;
        case 'customer.subscription.deleted':
            subscription = event.data.object;
            status = subscription.status;
            await eventTracker.notify({
                message: EventTracker.compileBasicNotification(`Subscription status is ${status} for subscription with id: ${subscription.id}`, 'Stripe Webhook: customer.subscription.deleted'),
                severity: 'info',
            } satisfies INotifyMessage)
            await eventTracker.submit(builSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_CANCEL));
            // Then define and call a method to handle the subscription deleted.
            // handleSubscriptionDeleted(subscriptionDeleted);
            break;
        case 'customer.subscription.created':
            subscription = event.data.object;
            status = subscription.status;
            await eventTracker.notify({
                message: EventTracker.compileBasicNotification(`Subscription status is ${status} for subscription with id: ${subscription.id}`, 'Stripe Webhook: customer.subscription.created'),
                severity: 'info',
            } satisfies INotifyMessage)
            await eventTracker.submit(builSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_CREATE));
            // Then define and call a method to handle the subscription created.
            // handleSubscriptionCreated(subscription);
            break;
        case 'customer.subscription.updated':
            subscription = event.data.object;
            status = subscription.status;
            await eventTracker.notify({
                message: EventTracker.compileBasicNotification(`Subscription status is ${status} for subscription with id: ${subscription.id}`, 'Stripe Webhook: customer.subscription.updated'),
                severity: 'info',
            } satisfies INotifyMessage)
            await eventTracker.submit(builSubmitOperation(subscription, OperationNameEnum.SUBSCRIPTION_UPDATE));
            // Then define and call a method to handle the subscription update.
            // handleSubscriptionUpdated(subscription);
            break;
        default:
            // Unexpected event type
            eventTracker.notify({
                message: EventTracker.compileBasicNotification(`Unexpected event type: ${event.type}`, 'Stripe Webhook: unexpected'),
                severity: 'error',
            } satisfies INotifyMessage)
        }
        // Return a 200 response to acknowledge receipt of the event
        return response.status(StatusCodes.OK).send();
    }
}