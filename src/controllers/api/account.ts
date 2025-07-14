import type { Request, Response } from 'express';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { PaymentAccountEntity } from '../../database/entities/payment.account.entity.js';
import type {
	QueryCustomerResponseBody,
	QueryIdTokenResponseBody,
	UnsuccessfulQueryCustomerResponseBody,
	UnsuccessfulQueryIdTokenResponseBody,
} from '../../types/customer.js';
import type { UnsuccessfulResponseBody } from '../../types/shared.js';
import type { ISubmitOperation, ISubmitStripeCustomerCreateData } from '../../services/track/submitter.js';
import type Stripe from 'stripe';
import type { SafeAPIResponse } from '../../types/common.js';

import { CheqdNetwork, checkBalance } from '@cheqd/sdk';
import { TESTNET_MINIMUM_BALANCE, DEFAULT_DENOM_EXPONENT, OperationNameEnum } from '../../types/constants.js';
import { CustomerService } from '../../services/api/customer.js';
import { LogToHelper } from '../../middleware/auth/logto-helper.js';
import { FaucetHelper } from '../../helpers/faucet.js';
import { StatusCodes } from 'http-status-codes';
import { LogToWebHook } from '../../middleware/hook.js';
import { UserService } from '../../services/api/user.js';
import { PaymentAccountService } from '../../services/api/payment-account.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { check } from 'express-validator';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import * as dotenv from 'dotenv';
import { validate } from '../validator/decorator.js';
import { SupportedKeyTypes } from '@veramo/utils';
import { SubscriptionService } from '../../services/admin/subscription.js';
import { RoleService } from '../../services/api/role.js';
import { getStripeObjectKey } from '../../utils/index.js';
import { KeyService } from '../../services/api/key.js';
import { LocalStore } from '../../database/cache/store.js';
import { BootStrapAccountResponse } from '../../types/account.js';
import { RoleEntity } from '../../database/entities/role.entity.js';

dotenv.config();

export class AccountController {
	public static createValidator = [
		check('primaryEmail')
			.exists()
			.withMessage('primaryEmail is required')
			.bail()
			.isEmail()
			.withMessage('Invalid email id')
			.bail(),
		check('name').optional().isString().withMessage('name should be a valid string'),
	];
	/**
	 * @openapi
	 *
	 * /account:
	 *   get:
	 *     tags: [Account]
	 *     summary: Fetch custodian-mode client details.
	 *     description: This endpoint returns the custodian-mode client details for authenticated users.
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Customer'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async get(_request: Request, response: Response) {
		try {
			if (!response.locals.customer) {
				// It's not ok, seems like there no any customer assigned to the user yet
				// But it's not an expected behaviour cause it should be done on bootstrap phase of after migration
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: 'Bad state cause there is no customer assigned to the user yet. Please contact administrator.',
				} satisfies UnsuccessfulQueryCustomerResponseBody);
			}

			const cachedAccounts = LocalStore.instance.getCustomerAccounts(response.locals.customer.customerId);
			let paymentAccounts: PaymentAccountEntity[];
			if (cachedAccounts?.length == 2) {
				paymentAccounts = cachedAccounts;
			} else {
				paymentAccounts = await PaymentAccountService.instance.find({ customer: response.locals.customer });
			}
			const result: QueryCustomerResponseBody = {
				customer: {
					customerId: response.locals.customer.customerId,
					name: response.locals.customer.name,
				},
				paymentAccount: {
					mainnet: paymentAccounts.find((acc) => acc.namespace === CheqdNetwork.Mainnet)?.address ?? '',
					testnet: paymentAccounts.find((acc) => acc.namespace === CheqdNetwork.Testnet)?.address ?? '',
				},
			};

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulQueryCustomerResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /account/idtoken:
	 *   get:
	 *     tags: [Account]
	 *     summary: Fetch IdToken.
	 *     description: This endpoint returns IdToken as JWT with list of user roles inside
	 *     deprecated: true
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/QueryIdTokenResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async getIdToken(request: Request, response: Response) {
		if (!request.user || !request.session.idToken) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'Seems like Authorization process was corrupted. Please contact administrator.',
			} satisfies UnsuccessfulQueryIdTokenResponseBody);
		}

		const identityStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			// Get the API key for the customer
			let apiKey = await identityStrategySetup.agent.getAPIKey(response.locals.customer, response.locals.user);
			// If there is no API key for the customer - create it
			if (!apiKey) {
				apiKey = await identityStrategySetup.agent.setAPIKey(
					request.session.idToken,
					response.locals.customer,
					response.locals.user
				);
			} else if (apiKey.isExpired()) {
				// If API key is expired - update it
				apiKey = await identityStrategySetup.agent.updateAPIKey(apiKey, request.session.idToken);
			}
			return response.status(StatusCodes.OK).json({
				idToken: apiKey?.apiKey,
			} satisfies QueryIdTokenResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulQueryIdTokenResponseBody);
		}
	}

	public async bootstrap(request: Request, response: Response) {
		// For now we keep temporary 1-1 relation between user and customer
		// So the flow is:
		// 1. Get LogTo user id from request body
		// 2. Check if there is customer associated with such user
		// 2.1 If not, create a new customer entity
		// 3. Assign role to user
		// 3.1 If user already has a subscription, assign role based on subscription
		// 3.2 Else assign the default "Portal" role
		// 4. If no customer is associated with the user (from point 2), create customer
		// 4.1 Assign customer to the user
		// 5. Create User
		// 6. Add the Stripe account to the Customer
		// 7. Check is paymentAccount exists for the customer
		// 7.1. If no - create it
		// 8.a Create custom_data and update the userInfo (send it to the LogTo)
		// 8.a If custom_data is empty - create it
		// 8.b Check the token balance for Testnet account

		// Status Tracker
		const status = BootStrapAccountResponse.initialize();

		// 1. Get logTo UserId from request body
		if (!request.body.user || !request.body.user.id || !request.body.user.primaryEmail) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'User id is not specified or primaryEmail is not set',
			} satisfies UnsuccessfulResponseBody);
		}
		const logToUserId = request.body.user.id;
		const logToUserEmail = request.body.user.primaryEmail;
		// use email as name, because "name" is unique in the current db setup.
		const logToName = request.body.user.name || logToUserEmail;

		const stripe = response.locals.stripe as Stripe;
		const logToHelper = new LogToHelper();
		// 2. Check if such row exists in the DB
		// eslint-disable-next-line prefer-const
		let [userEntity, [customerEntity], logtoHelperSetup] = await Promise.all([
			UserService.instance.get(logToUserId, { customer: true }),
			CustomerService.instance.find({ email: logToUserEmail }),
			logToHelper.setup(),
		]);

		if (logtoHelperSetup.status !== StatusCodes.OK) {
			return response.status(StatusCodes.SERVICE_UNAVAILABLE).json({
				error: logtoHelperSetup.error,
			} satisfies UnsuccessfulResponseBody);
		}

		try {
			if (!userEntity) {
				// 2. If no - create customer first
				// Cause for now we assume only 1-1 connection between user and customer
				// We think here that if no user row - no customer also, cause customer should be created before user
				// Even if customer was created before for such user but the process was interruted somehow - we need to create it again
				// Cause we don't know the state of the customer in this case
				// 2.1.1. Create customer
				// I’m setting the "name" field to an empty string on the current CustomerEntity because it is non-nullable.
				//  we will populate the customer's "name" field using the response from the Stripe account creation in account-submitter.ts.
				if (!customerEntity) {
					customerEntity = (await CustomerService.instance.create(
						logToName,
						logToUserEmail
					)) as CustomerEntity;
					if (!customerEntity) {
						return response.status(StatusCodes.BAD_REQUEST).json({
							error: 'User is not found in database: Customer was not created',
						} satisfies UnsuccessfulResponseBody);
					}
					// Notify
					await eventTracker.notify({
						message: EventTracker.compileBasicNotification(
							'User was not found in database: Customer with customerId: ' +
								customerEntity.customerId +
								' was created'
						),
						severity: 'info',
					});
				}

				// 3 Assign role to user
				let role: RoleEntity | null = null;
				const logtoRoleSync = await syncLogtoUserRoles(
					logToHelper,
					stripe,
					request,
					logToUserId,
					customerEntity
				);
				if (!logtoRoleSync.success) {
					role = await RoleService.instance.getDefaultRole();
				} else {
					role = await RoleService.instance.findOne({ name: logtoRoleSync.data });
				}

				if (!role) {
					return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
						error: `Internal error: No logto role found`,
					} satisfies UnsuccessfulResponseBody);
				}

				// 2.3. Create user
				userEntity = await UserService.instance.create(logToUserId, customerEntity, role);
				if (!userEntity) {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: 'User is not found in database: User was not created',
					} satisfies UnsuccessfulResponseBody);
				}
				// Notify
				await eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						'User was not found in database: User with userId: ' + userEntity.logToId + ' was created'
					),
					severity: 'info',
				});
			}

			//4. Check if there is customer associated with such user
			if (!userEntity.customer) {
				customerEntity = (await CustomerService.instance.create(logToName, logToUserEmail)) as CustomerEntity;
				if (!customerEntity) {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: 'User exists in database: Customer was not created',
					} satisfies UnsuccessfulResponseBody);
				}
				// Notify
				await eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						'User exists in database: Customer with customerId: ' +
							customerEntity.customerId +
							' was created'
					),
					severity: 'info',
				});
				//4.1. Assign customer to the user
				userEntity.customer = customerEntity;
				await UserService.instance.update(userEntity.logToId, customerEntity);
			} else {
				customerEntity = userEntity.customer;
			}

			// Customer initializaiton is complete
			status.customerInitialized = true;

			// 6. check Stripe account if still missing
			if (process.env.STRIPE_ENABLED === 'true' && !customerEntity.paymentProviderId) {
				// should we await? or fire off and forget?
				await eventTracker.submit({
					operation: OperationNameEnum.STRIPE_ACCOUNT_CREATE,
					data: {
						name: customerEntity.name,
						email: customerEntity.email,
						customerId: customerEntity.customerId,
					},
				});
			}
			status.stripeAccountCreated = true;

			// 7. Provision Mainnet & Testnet accounts in parallel
			const accounts = await PaymentAccountService.instance.find({ customer: customerEntity }, { key: true });
			const [mainnetResp, testnetResp] = await Promise.all([
				AccountController.provisionCustomerAccount(CheqdNetwork.Mainnet, accounts, customerEntity),
				AccountController.provisionCustomerAccount(CheqdNetwork.Testnet, accounts, customerEntity),
			]);

			if (mainnetResp.success) {
				status.mainnetAccountProvisioned = true;
			} else status.errors.push(mainnetResp.error);

			if (testnetResp.success) {
				status.testnetAccountProvisioned = true;
			} else status.errors.push(testnetResp.error);

			// 8. Update LogTo custom data and Top‑up Testnet in parallel (non-blocking)
			await Promise.all([
				updateCustomData(userEntity.logToId, customerEntity, mainnetResp, testnetResp, logToHelper, status),
				topupTestnet(customerEntity, testnetResp, status),
			]);

			// 9. Send response with full status
			const allOK = status.errors.length === 0;
			return response
				.status(allOK ? StatusCodes.OK : StatusCodes.INTERNAL_SERVER_ERROR)
				.json({ success: allOK, status });
		} catch (err: any) {
			console.error('Bootstrap error:', err);
			status.errors.push((err as Error)?.message || err);
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				success: false,
				status,
			});
		}
	}

	static async provisionCustomerAccount(
		network: CheqdNetwork,
		accounts: PaymentAccountEntity[],
		customerEntity: CustomerEntity
	): Promise<SafeAPIResponse<PaymentAccountEntity>> {
		const existingAccount = accounts.find((acc) => acc.namespace === network);
		if (existingAccount) {
			const key = await KeyService.instance.get(existingAccount.key.kid);
			if (key) {
				return {
					success: true,
					status: 200,
					data: existingAccount,
				};
			}

			return {
				success: false,
				status: 412, // precondition
				error: `Error: account key not found for kid: ${existingAccount.key.kid}`,
			};
		}

		const key = await new IdentityServiceStrategySetup(customerEntity.customerId).agent.createKey(
			SupportedKeyTypes.Secp256k1,
			customerEntity
		);
		if (!key) {
			return {
				success: false,
				status: 400,
				error: `PaymentAccount is not found in database: ${network} key was not created`,
			};
		}

		const account = (await PaymentAccountService.instance.create(
			network,
			true,
			customerEntity,
			key
		)) as PaymentAccountEntity;
		if (!account) {
			return {
				success: false,
				status: 400,
				error: 'PaymentAccount is not found in database: Payment account was not created',
			};
		}

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`PaymentAccount was not found in database: Payment account with address: ${account.address} on ${network} was created`
			),
			severity: 'info',
		});

		return {
			success: true,
			status: 200,
			data: account,
		};
	}

	/**
	 * @openapi
	 *
	 * /account/create:
	 *   post:
	 *     tags: [Account]
	 *     summary: Create an client for an authenticated user.
	 *     description: This endpoint creates a client in the custodian-mode for an authenticated user
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/AccountCreateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccountCreateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/QueryIdTokenResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async create(request: Request, response: Response) {
		// For now we keep temporary 1-1 relation between user and customer
		// So the flow is:
		// 1. Get username from request body
		// 2. Check if the customer exists
		// 2.1. if no - Create customer
		// 3. Check is paymentAccount exists for the customer
		// 3.1. If no - create it
		// 4. Check the token balance for Testnet account

		// 1. Get logTo UserId from request body
		const { name, primaryEmail } = request.body;

		try {
			// 2. Check if the customer exists
			const customerEntity = response.locals.customer
				? (response.locals.customer as CustomerEntity)
				: // 2.1 Create customer
					((await CustomerService.instance.create(name || primaryEmail, primaryEmail)) as CustomerEntity);

			if (!customerEntity) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'Customer creation failed',
				});
			}

			// 3. Check if paymentAccount exists for the customer
			const accounts = await PaymentAccountService.instance.find({ customer: customerEntity });
			const mainnetAccountResponse = await AccountController.provisionCustomerAccount(
				CheqdNetwork.Mainnet,
				accounts,
				customerEntity
			);
			if (!mainnetAccountResponse.success) {
				return response.status(mainnetAccountResponse.status).json({
					error: mainnetAccountResponse.error,
				} satisfies UnsuccessfulResponseBody);
			}

			const testnetAccountResponse = await AccountController.provisionCustomerAccount(
				CheqdNetwork.Testnet,
				accounts,
				customerEntity
			);
			if (!testnetAccountResponse.success) {
				return response.status(testnetAccountResponse.status).json({
					error: testnetAccountResponse.error,
				} satisfies UnsuccessfulResponseBody);
			}

			const testnetAccount = testnetAccountResponse.data;

			// 4. Check the token balance for Testnet account
			if (testnetAccount.address && process.env.ENABLE_ACCOUNT_TOPUP === 'true') {
				const balances = await checkBalance(testnetAccount.address, process.env.TESTNET_RPC_URL);
				const balance = balances[0];
				if (!balance || +balance.amount < TESTNET_MINIMUM_BALANCE * Math.pow(10, DEFAULT_DENOM_EXPONENT)) {
					// 3.1 If it's less then required for DID creation - assign new portion from testnet-faucet
					const resp = await FaucetHelper.delegateTokens(
						testnetAccount.address,
						customerEntity.name,
						customerEntity.email
					);

					if (resp.status !== StatusCodes.OK) {
						return response.status(StatusCodes.BAD_GATEWAY).json({
							error: resp.error,
						});
					}
				}
			}
			// 5. Setup stripe account
			if (process.env.STRIPE_ENABLED === 'true' && !customerEntity.paymentProviderId) {
				await eventTracker.submit({
					operation: OperationNameEnum.STRIPE_ACCOUNT_CREATE,
					data: {
						name: customerEntity.name,
						email: customerEntity.email,
						customerId: customerEntity.customerId,
					} satisfies ISubmitStripeCustomerCreateData,
				} satisfies ISubmitOperation);
			}
			return response.status(StatusCodes.CREATED).json(customerEntity);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal Error: ${(error as Error)?.message || error}`,
			});
		}
	}
}

async function syncLogtoUserRoles(
	logToHelper: LogToHelper,
	stripe: Stripe,
	request: Request,
	logToUserId: string,
	customer: CustomerEntity
): Promise<SafeAPIResponse<string>> {
	// 3.1 If user already has a subscription, assign role based on subscription
	// 3.2 Else assign the default "Portal" role
	if (!LogToWebHook.isUserSuspended(request)) {
		const subscription = await SubscriptionService.instance.findCurrent(customer);
		if (!subscription) {
			return {
				success: false,
				error: `Logto role assigned failed: No active subscription found for customer with id: ${customer.customerId}`,
				status: 400,
			};
		}

		const stripeSubscription = await stripe.subscriptions.retrieve(subscription.subscriptionId);
		const stripeProduct = await stripe.products.retrieve(
			getStripeObjectKey(stripeSubscription.items.data[0].plan.product)
		);

		const roleResponse = await logToHelper.assignCustomerPlanRoles(logToUserId, stripeProduct);
		if (roleResponse.status !== StatusCodes.OK) {
			return {
				success: false,
				status: roleResponse.status,
				error: roleResponse.error,
			};
		}

		await eventTracker.notify({
			message: EventTracker.compileBasicNotification(
				`${stripeProduct.name} role was assigned to user with id: ${logToUserId}`
			),
			severity: 'info',
		});

		return {
			success: true,
			status: 200,
			data: stripeProduct.name,
		};
	}

	return {
		success: false,
		error: `Logto role not assigned: User with id ${logToUserId} is suspended`,
		status: 409,
	};
}

async function updateCustomData(
	logToId: string,
	customer: CustomerEntity,
	mainnetResp: any,
	testnetResp: any,
	logToHelper: LogToHelper,
	status: BootStrapAccountResponse
) {
	try {
		const existing = await logToHelper.getCustomData(logToId);
		if (Object.keys(existing.data).length === 0 && mainnetResp.data?.address && testnetResp.data?.address) {
			const customData = {
				customer: { id: customer.customerId, name: customer.name },
				paymentAccount: {
					mainnet: mainnetResp.data.address,
					testnet: testnetResp.data.address,
				},
			};
			const res = await logToHelper.updateCustomData(logToId, customData);
			if (res.status === 200) status.customDataUpdated = true;
		}
	} catch (err: any) {
		status.errors.push((err as Error)?.message || err);
		console.warn('Logto Custom Data Update failed:', err);
	}
}

async function topupTestnet(customer: CustomerEntity, testnetResp: any, status: BootStrapAccountResponse) {
	if (!testnetResp.data?.address || process.env.ENABLE_ACCOUNT_TOPUP !== 'true') {
		return;
	}
	try {
		const balances = await checkBalance(testnetResp.data.address, process.env.TESTNET_RPC_URL);
		const bal = balances[0];
		if (!bal || +bal.amount < TESTNET_MINIMUM_BALANCE * 10 ** DEFAULT_DENOM_EXPONENT) {
			const faucet = await FaucetHelper.delegateTokens(testnetResp.data.address, customer.name, customer.email);
			if (faucet.status === StatusCodes.OK) {
				status.testnetMinimumBalance = true;
			} else {
				status.errors.push(faucet.error);
			}
		} else {
			status.testnetMinimumBalance = true;
		}
	} catch (err: any) {
		status.errors.push((err as Error)?.message || err);
		console.warn('Faucet request failed or timed out:', err);
	}
}
