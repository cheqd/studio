import Stripe from 'stripe';
import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import { OperationNameEnum } from '../../../types/constants.js';
import type { INotifyMessage } from '../../../types/track.js';
import { SubscriptionService } from '../../admin/subscription.js';
import { CustomerService } from '../../api/customer.js';
import type { ISubmitOperation, ISubmitSubscriptionData } from '../submitter.js';
import { EventTracker } from '../tracker.js';
import type { IObserver } from '../types.js';
import type { FindOptionsWhere } from 'typeorm';
import { LogToHelper } from '../../../middleware/auth/logto-helper.js';
import { StatusCodes } from 'http-status-codes';
import type { SupportedPlanTypes } from '../../../types/admin.js';
import { UserService } from '../../api/user.js';

export class SubscriptionSubmitter implements IObserver {
	private emitter: EventEmitter;
	private readonly stripe: Stripe;

	constructor(emitter: EventEmitter) {
		this.emitter = emitter;
		this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

	private async handleCustomerRoleAssignment(
		operation: ISubmitOperation,
		logToHelper: LogToHelper,
		userLogtoId: string,
		productName: string
	) {
		const roleAssignmentResponse = await logToHelper.assignCustomerPlanRoles(
			userLogtoId,
			productName.toLowerCase() as SupportedPlanTypes
		);
		if (roleAssignmentResponse.status !== 201) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Failed to assign roles to user for planType ${productName}: ${roleAssignmentResponse.error}`,
					operation.operation
				),
				severity: 'error',
			});
			return;
		}

		this.notify({
			message: EventTracker.compileBasicNotification(
				`${productName} plan assigned to user with logtoId ${userLogtoId}`,
				operation.operation
			),
			severity: 'info',
		});
	}

	private async handleCustomerRoleRemoval(operation: ISubmitOperation, logto: LogToHelper, userLogtoId: string) {
		const responses = await Promise.allSettled([
			logto.removeLogtoRoleFromUser(userLogtoId, process.env.LOGTO_TESTNET_ROLE_ID.trim()),
			logto.removeLogtoRoleFromUser(userLogtoId, process.env.LOGTO_MAINNET_ROLE_ID.trim()),
		]);

		const allRolesRemoved = responses.every((r) => r.status === 'fulfilled' && r.value.status === StatusCodes.OK);
		if (allRolesRemoved) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Roles have been removed successfully for user with id: ${userLogtoId}`,
					operation.operation
				),
				severity: 'info',
			});
			return;
		}

		for (const resp of responses) {
			if (resp.status === 'rejected' || resp.value.status !== StatusCodes.OK) {
				const errMsg = resp.status === 'rejected' ? (resp.reason as Error).message : resp.value.error;
				this.notify({
					message: EventTracker.compileBasicNotification(
						`Role removal error: ${errMsg}`,
						operation.operation
					),
					severity: 'error',
				});
			}
		}
	}

	private async syncLogtoRoles(operation: ISubmitOperation, customerId: string, productName: string) {
		const logToHelper = new LogToHelper();
		const setupResp = await logToHelper.setup();
		if (setupResp.status !== StatusCodes.OK) {
			this.notify({
				message: EventTracker.compileBasicNotification(
					`Logto client initialisation failed: ${setupResp.error}`,
					operation.operation
				),
				severity: 'error',
			});

			return;
		}

		const user = await UserService.instance.userRepository.findOne({ where: { customer: { customerId } } });

		if (user) {
			switch (operation.operation) {
				case OperationNameEnum.SUBSCRIPTION_CREATE:
				case OperationNameEnum.SUBSCRIPTION_UPDATE:
					this.handleCustomerRoleAssignment(operation, logToHelper, user.logToId, productName);
					return;
				case OperationNameEnum.SUBSCRIPTION_CANCEL:
					this.handleCustomerRoleRemoval(operation, logToHelper, user.logToId);
					return;
			}
		}

		this.notify({
			message: EventTracker.compileBasicNotification(
				`Role assignment failed: No user found with customerId: ${customerId}`,
				operation.operation
			),
			severity: 'error',
		});
	}

	async submitSubscriptionCreate(operation: ISubmitOperation): Promise<void> {
		const data = operation.data as ISubmitSubscriptionData;
		let customer: CustomerEntity | undefined = operation.options?.customer;

		try {
			const [product, stripeCustomer] = await Promise.all([
				this.stripe.products.retrieve(data.productId),
				this.stripe.customers.retrieve(data.paymentProviderId),
			]);
			if (!customer) {
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

			await this.syncLogtoRoles(operation, customer.customerId, product.name);

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

			const [customer, product] = await Promise.all([
				CustomerService.instance.findbyPaymentProviderId(data.paymentProviderId),
				this.stripe.products.retrieve(data.productId),
			]);

			if (customer) {
				await this.syncLogtoRoles(operation, customer.customerId, product.name);
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

			const customer = await CustomerService.instance.findbyPaymentProviderId(data.paymentProviderId);
			if (customer) {
				this.syncLogtoRoles(operation, customer.customerId, '');
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
