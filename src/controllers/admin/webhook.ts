import type Stripe from 'stripe';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import type { INotifyMessage } from '../../types/track.js';
import { OperationNameEnum } from '../../types/constants.js';
import { SubscriptionService } from '../../services/admin/subscription.js';
import { CustomerService } from '../../services/api/customer.js';
import { LogToHelper } from '../../middleware/auth/logto-helper.js';
import { UserService } from '../../services/api/user.js';
import type { SupportedPlanTypes } from '../../types/admin.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { buildSubscriptionData } from '../../services/track/helpers.js';

dotenv.config();
export class WebhookController {
	public static instance = new WebhookController();

	public async handleWebhook(request: Request, response: Response) {
		// Signature verification and webhook handling is placed in the same method
		// cause stripe uses the mthod which validate the signature and provides the event.
		let event = request.body;
		const stripe = response.locals.stripe as Stripe;

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
				case 'customer.subscription.deleted':
					await WebhookController.instance.handleSubscriptionCancel(stripe, event.data.object);
					break;
				case 'customer.subscription.created':
					await WebhookController.instance.handleSubscriptionCreate(stripe, event.data.object);
					break;
				case 'customer.subscription.updated':
					await WebhookController.instance.handleSubscriptionUpdate(stripe, event.data.object);
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
					`Webhook failed: ${(error as Error)?.message || error} with type: ${event?.type}`,
					'Stripe Webhook: unexpected'
				),
				severity: 'error',
			} satisfies INotifyMessage);

			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	async handleSubscriptionCreate(
		stripe: Stripe,
		stripeSubscription: Stripe.Subscription,
		customer?: CustomerEntity
	): Promise<void> {
		const data = buildSubscriptionData(stripeSubscription);
		const operation = OperationNameEnum.SUBSCRIPTION_CREATE;

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription status is ${stripeSubscription.status} for subscription with id: ${stripeSubscription.id}`,
				'Stripe Webhook: customer.subscription.created'
			),
			severity: 'info',
		} satisfies INotifyMessage);

		console.log('fetching stripe data');
		const [product, stripeCustomer] = await Promise.all([
			stripe.products.retrieve(data.productId),
			stripe.customers.retrieve(data.paymentProviderId),
		]);
		if (!customer) {
			const customers = await CustomerService.instance.customerRepository.find({
				where: { paymentProviderId: data.paymentProviderId },
			});
			if (customers.length === 0) {
				// we add an additional check in case that a customer was created locally with email and no paymentProviderId
				if (!stripeCustomer.deleted && stripeCustomer.email) {
					const customerWithoutPaymentProviderId = await CustomerService.instance.customerRepository.findOne({
						where: { email: stripeCustomer.email },
					});

					if (!customerWithoutPaymentProviderId) {
						await eventTracker.notify({
							message: EventTracker.compileBasicNotification(
								`Customer not found for Cheqd Studio, creating new customer record with paymentProviderId: ${data.paymentProviderId}`,
								operation
							),
							severity: 'info',
						});

						const customerName = stripeCustomer.name ?? stripeCustomer.email;
						customers.push(
							await CustomerService.instance.create(
								customerName,
								stripeCustomer.email,
								undefined,
								data.paymentProviderId
							)
						);
					} else {
						customers.push(customerWithoutPaymentProviderId);
					}
				} else {
					const message = EventTracker.compileBasicNotification(
						`Customer not found for Cheqd Studio, cannot create new customer without a email id: ${data.paymentProviderId}`,
						operation
					);
					await eventTracker.notify({
						message,
						severity: 'error',
					});
					throw new Error(message);
				}
			} else if (customers.length !== 1) {
				const message = EventTracker.compileBasicNotification(
					`Only one Stripe account should be associated with CaaS customer. Stripe accountId: ${data.paymentProviderId}.`,
					operation
				);
				await eventTracker.notify({
					message,
					severity: 'error',
				});
				throw new Error(message);
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
			const message = EventTracker.compileBasicNotification(
				`Failed to create a new subscription with id: ${data.subscriptionId}.`,
				operation
			);
			await eventTracker.notify({
				message,
				severity: 'error',
			});
			throw new Error(message);
		}

		await this.syncLogtoRoles(operation, customer.customerId, product.name);

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription created with id: ${data.subscriptionId}.`,
				operation
			),
			severity: 'info',
		});
	}

	async handleSubscriptionUpdate(stripe: Stripe, stripeSubscription: Stripe.Subscription): Promise<void> {
		const data = buildSubscriptionData(stripeSubscription);
		const operation = OperationNameEnum.SUBSCRIPTION_UPDATE;

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription status is ${stripeSubscription.status} for subscription with id: ${stripeSubscription.id}`,
				'Stripe Webhook: customer.subscription.updated'
			),
			severity: 'info',
		} satisfies INotifyMessage);

		const subscription = await SubscriptionService.instance.update(
			data.subscriptionId,
			data.status,
			data.currentPeriodStart,
			data.currentPeriodEnd,
			data.trialStart as Date,
			data.trialEnd as Date
		);
		if (!subscription) {
			const message = EventTracker.compileBasicNotification(
				`Failed to update subscription with id: ${data.subscriptionId}.`,
				operation
			);
			await eventTracker.notify({
				message,
				severity: 'error',
			});

			throw new Error(message);
		}

		const [customer, product] = await Promise.all([
			CustomerService.instance.findbyPaymentProviderId(data.paymentProviderId),
			stripe.products.retrieve(data.productId),
		]);

		if (customer) {
			await this.syncLogtoRoles(operation, customer.customerId, product.name);
		}

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription updated with id: ${data.subscriptionId}.`,
				operation
			),
			severity: 'info',
		});
	}

	async handleSubscriptionCancel(stripe: Stripe, stripeSubscription: Stripe.Subscription): Promise<void> {
		const data = buildSubscriptionData(stripeSubscription);
		const operation = OperationNameEnum.SUBSCRIPTION_CANCEL;

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription status is ${stripeSubscription.status} for subscription with id: ${stripeSubscription.id}`,
				'Stripe Webhook: customer.subscription.deleted'
			),
			severity: 'info',
		} satisfies INotifyMessage);

		const subscription = await SubscriptionService.instance.update(data.subscriptionId, data.status);
		if (!subscription) {
			const message = EventTracker.compileBasicNotification(
				`Failed to cancel subscription with id: ${data.subscriptionId}.`,
				operation
			);
			await eventTracker.notify({
				message,
				severity: 'error',
			});

			throw new Error(message);
		}

		const customer = await CustomerService.instance.findbyPaymentProviderId(data.paymentProviderId);
		if (customer) {
			this.syncLogtoRoles(operation, customer.customerId, '');
		}

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`Subscription canceled with id: ${data.subscriptionId}.`,
				operation
			),
			severity: 'info',
		});
	}

	private async handleCustomerRoleAssignment(
		operation: OperationNameEnum,
		logToHelper: LogToHelper,
		userLogtoId: string,
		productName: string
	) {
		const roleAssignmentResponse = await logToHelper.assignCustomerPlanRoles(
			userLogtoId,
			productName.toLowerCase() as SupportedPlanTypes
		);
		if (roleAssignmentResponse.status !== 201) {
			const message = EventTracker.compileBasicNotification(
				`Failed to assign roles to user for planType ${productName}: ${roleAssignmentResponse.error}`,
				operation
			);
			await eventTracker.notify({
				message,
				severity: 'error',
			});
			throw new Error(message);
		}

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`${productName} plan assigned to user with logtoId ${userLogtoId}`,
				operation
			),
			severity: 'info',
		});
	}

	private async handleCustomerRoleRemoval(operation: OperationNameEnum, logto: LogToHelper, userLogtoId: string) {
		const responses = await Promise.allSettled([
			logto.removeLogtoRoleFromUser(userLogtoId, process.env.LOGTO_TESTNET_ROLE_ID.trim()),
			logto.removeLogtoRoleFromUser(userLogtoId, process.env.LOGTO_MAINNET_ROLE_ID.trim()),
		]);

		const allRolesRemoved = responses.every((r) => r.status === 'fulfilled' && r.value.status === StatusCodes.OK);
		if (allRolesRemoved) {
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Roles have been removed successfully for user with id: ${userLogtoId}`,
					operation
				),
				severity: 'info',
			});
			return;
		}

		for (const resp of responses) {
			if (resp.status === 'rejected' || resp.value.status !== StatusCodes.OK) {
				const errMsg = resp.status === 'rejected' ? (resp.reason as Error).message : resp.value.error;
				await eventTracker.notify({
					message: EventTracker.compileBasicNotification(`Role removal error: ${errMsg}`, operation),
					severity: 'error',
				});
				throw new Error(errMsg);
			}
		}
	}

	private async syncLogtoRoles(operation: OperationNameEnum, customerId: string, productName: string) {
		const logToHelper = new LogToHelper();
		const setupResp = await logToHelper.setup();
		if (setupResp.status !== StatusCodes.OK) {
			const message = EventTracker.compileBasicNotification(
				`Logto client initialisation failed: ${setupResp.error}`,
				operation
			);
			await eventTracker.notify({
				message,
				severity: 'error',
			});

			throw new Error(message);
		}

		const user = await UserService.instance.userRepository.findOne({ where: { customer: { customerId } } });

		if (user) {
			switch (operation) {
				case OperationNameEnum.SUBSCRIPTION_CREATE:
				case OperationNameEnum.SUBSCRIPTION_UPDATE:
					this.handleCustomerRoleAssignment(operation, logToHelper, user.logToId, productName);
					return;
				case OperationNameEnum.SUBSCRIPTION_CANCEL:
					this.handleCustomerRoleRemoval(operation, logToHelper, user.logToId);
					return;
			}
		}

		const message = EventTracker.compileBasicNotification(
			`Role assignment failed: No user found with customerId: ${customerId}`,
			operation
		);
		await eventTracker.notify({
			message,
			severity: 'error',
		});
		throw new Error(message);
	}
}
