import type { Request, Response } from 'express';
import { CheqdNetwork, checkBalance } from '@cheqd/sdk';
import { TESTNET_MINIMUM_BALANCE, DEFAULT_DENOM_EXPONENT, OperationNameEnum } from '../../types/constants.js';
import { CustomerService } from '../../services/api/customer.js';
import { LogToHelper } from '../../middleware/auth/logto-helper.js';
import { FaucetHelper } from '../../helpers/faucet.js';
import { StatusCodes } from 'http-status-codes';
import { LogToWebHook } from '../../middleware/hook.js';
import { UserService } from '../../services/api/user.js';
import { RoleService } from '../../services/api/role.js';
import { PaymentAccountService } from '../../services/api/payment-account.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import type { PaymentAccountEntity } from '../../database/entities/payment.account.entity.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import type {
	QueryCustomerResponseBody,
	QueryIdTokenResponseBody,
	UnsuccessfulQueryCustomerResponseBody,
	UnsuccessfulQueryIdTokenResponseBody,
} from '../../types/customer.js';
import type { UnsuccessfulResponseBody } from '../../types/shared.js';
import { check } from 'express-validator';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import type { ISubmitOperation, ISubmitStripeCustomerCreateData } from '../../services/track/submitter.js';
import * as dotenv from 'dotenv';
import { validate } from '../validator/decorator.js';
import { SupportedKeyTypes } from '@veramo/utils';
dotenv.config();

export class AccountController {
	public static createValidator = [
		check('username')
			.exists()
			.withMessage('username is required')
			.isString()
			.withMessage('username should be a unique valid string'),
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
	public async get(request: Request, response: Response) {
		try {
			if (!response.locals.customer) {
				// It's not ok, seems like there no any customer assigned to the user yet
				// But it's not an expected behaviour cause it should be done on bootstrap phase of after migration
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: 'Bad state cause there is no customer assigned to the user yet. Please contact administrator.',
				} satisfies UnsuccessfulQueryCustomerResponseBody);
			}
			const paymentAccount = await PaymentAccountService.instance.find({ customer: response.locals.customer });
			const result = {
				customer: {
					customerId: response.locals.customer.customerId,
					name: response.locals.customer.name,
				},
				paymentAccount: {
					address: paymentAccount[0].address,
				},
			} satisfies QueryCustomerResponseBody;

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
				error: 'Seems like authorisation process was corrupted. Please contact administrator.',
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
		// 2. Check if such row exists in the DB
		// 2.1. If no - create it
		// 3. If yes - check that there is customer associated with such user
		// 3.1. If no:
		// 3.1.1. Create customer
		// 3.1.2. Assign customer to the user

		// 4. Check is paymentAccount exists for the customer
		// 4.1. If no - create it

		// 5. Assign default role on LogTo
		// 5.1 Get user's roles
		// 5.2 If list of roles is empty and the user is not suspended - assign default role
		// 6. Create custom_data and update the userInfo (send it to the LogTo)
		// 6.1 If custom_data is empty - create it
		// 7. Check the token balance for Testnet account

		let customer: CustomerEntity | null;
		let user: UserEntity | null;
		let paymentAccount: PaymentAccountEntity | null;

		// 1. Get logTo UserId from request body
		if (!request.body.user || !request.body.user.id || !request.body.user.primaryEmail) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'User id is not specified or primaryEmail is not set',
			} satisfies UnsuccessfulResponseBody);
		}
		const logToUserId = request.body.user.id;
		const logToUserEmail = request.body.user.primaryEmail;
		const logToName = request.body.user.name || logToUserEmail; // use email as name, because "name" is unique in the current db setup.

		const defaultRole = await RoleService.instance.getDefaultRole();
		if (!defaultRole) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'Default role is not set on Credential Service side',
			} satisfies UnsuccessfulResponseBody);
		}
		// 2. Check if such row exists in the DB
		user = await UserService.instance.get(logToUserId);
		if (!user) {
			// 2.1. If no - create customer first
			// Cause for now we assume only 1-1 connection between user and customer
			// We think here that if no user row - no customer also, cause customer should be created before user
			// Even if customer was created before for such user but the process was interruted somehow - we need to create it again
			// Cause we don't know the state of the customer in this case
			// 2.1.1. Create customer
			// I’m setting the "name" field to an empty string on the current CustomerEntity because it is non-nullable.
			//  we will populate the customer's "name" field using the response from the Stripe account creation in account-submitter.ts.
			customer = (await CustomerService.instance.create(logToName, logToUserEmail)) as CustomerEntity;
			if (!customer) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'User is not found in database: Customer was not created',
				} satisfies UnsuccessfulResponseBody);
			}
			// Notify
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					'User was not found in database: Customer with customerId: ' + customer.customerId + ' was created'
				),
				severity: 'info',
			});
			// 2.2. Create user
			user = await UserService.instance.create(logToUserId, customer, defaultRole);
			if (!user) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'User is not found in database: User was not created',
				} satisfies UnsuccessfulResponseBody);
			}
			// Notify
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					'User was not found in database: User with userId: ' + user.logToId + ' was created'
				),
				severity: 'info',
			});
		}
		// 3. If yes - check that there is customer associated with such user
		if (!user.customer) {
			// 3.1. If no:
			// 3.1.1. Create customer
			customer = (await CustomerService.instance.create(logToUserEmail)) as CustomerEntity;
			if (!customer) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'User exists in database: Customer was not created',
				} satisfies UnsuccessfulResponseBody);
			}
			// Notify
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					'User exists in database: Customer with customerId: ' + customer.customerId + ' was created'
				),
				severity: 'info',
			});
			// 3.1.2. Assign customer to the user
			user.customer = customer;
			await UserService.instance.update(user.logToId, customer);
		} else {
			customer = user.customer;
		}

		// 4. Check is paymentAccount exists for the customer
		const accounts = await PaymentAccountService.instance.find({ customer });
		if (accounts.length === 0) {
			const key = await new IdentityServiceStrategySetup(customer.customerId).agent.createKey(
				SupportedKeyTypes.Secp256k1,
				customer
			);
			if (!key) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'PaymentAccount is not found in database: Key was not created',
				} satisfies UnsuccessfulResponseBody);
			}
			paymentAccount = (await PaymentAccountService.instance.create(
				CheqdNetwork.Testnet,
				true,
				customer,
				key
			)) as PaymentAccountEntity;
			if (!paymentAccount) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'PaymentAccount is not found in database: Payment account was not created',
				} satisfies UnsuccessfulResponseBody);
			}
			// Notify
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					'PaymentAccount was not found in database: Payment account with address: ' +
						paymentAccount.address +
						' was created'
				),
				severity: 'info',
			});
		} else {
			paymentAccount = accounts[0];
		}

		const logToHelper = new LogToHelper();
		const _r = await logToHelper.setup();
		if (_r.status !== StatusCodes.OK) {
			return response.status(StatusCodes.BAD_GATEWAY).json({
				error: _r.error,
			} satisfies UnsuccessfulResponseBody);
		}
		// 5. Assign default role on LogTo
		// 5.1 Get user's roles

		const roles = await logToHelper.getRolesForUser(logToUserId);
		if (roles.status !== StatusCodes.OK) {
			return response.status(StatusCodes.BAD_GATEWAY).json({
				error: roles.error,
			} satisfies UnsuccessfulResponseBody);
		}

		// 5.2 If list of roles is empty and the user is not suspended - assign default role
		if (roles.data.length === 0 && !LogToWebHook.isUserSuspended(request)) {
			const _r = await logToHelper.setDefaultRoleForUser(user.logToId);
			if (_r.status !== StatusCodes.OK) {
				return response.status(StatusCodes.BAD_GATEWAY).json({
					error: _r.error,
				} satisfies UnsuccessfulResponseBody);
			}

			// Notify
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`Default role with id: ${process.env.LOGTO_DEFAULT_ROLE_ID} was assigned to user with id: ${user.logToId}`
				),
				severity: 'info',
			});
		}

		const customDataFromLogTo = await logToHelper.getCustomData(user.logToId);

		// 6. Create custom_data and update the userInfo (send it to the LogTo)
		if (Object.keys(customDataFromLogTo.data).length === 0 && paymentAccount.address) {
			const customData = {
				customer: {
					id: customer.customerId,
					name: customer.name,
				},
				paymentAccount: {
					address: paymentAccount.address,
				},
			};
			const _r = await logToHelper.updateCustomData(user.logToId, customData);
			if (_r.status !== 200) {
				return response.status(_r.status).json({
					error: _r.error,
				} satisfies UnsuccessfulResponseBody);
			}
		}

		// 7. Check the token balance for Testnet account
		if (paymentAccount.address && process.env.ENABLE_ACCOUNT_TOPUP === 'true') {
			const balances = await checkBalance(paymentAccount.address, process.env.TESTNET_RPC_URL);
			const balance = balances[0];
			if (!balance || +balance.amount < TESTNET_MINIMUM_BALANCE * Math.pow(10, DEFAULT_DENOM_EXPONENT)) {
				// 3.1 If it's less then required for DID creation - assign new portion from testnet-faucet
				const resp = await FaucetHelper.delegateTokens(paymentAccount.address);
				if (resp.status !== StatusCodes.OK) {
					return response.status(StatusCodes.BAD_GATEWAY).json({
						error: resp.error,
					} satisfies UnsuccessfulResponseBody);
				}
				// Notify
				await eventTracker.notify({
					message: EventTracker.compileBasicNotification(
						`Testnet account with address: ${paymentAccount.address} was funded with ${TESTNET_MINIMUM_BALANCE}`
					),
					severity: 'info',
				});
			}
		}

		// 8. Add the Stripe account to the Customer
		if (process.env.STRIPE_ENABLED === 'true' && !customer.paymentProviderId) {
			eventTracker.submit({
				operation: OperationNameEnum.STRIPE_ACCOUNT_CREATE,
				data: {
					name: customer.name,
					email: customer.email,
					customerId: customer.customerId,
				} satisfies ISubmitStripeCustomerCreateData,
			} satisfies ISubmitOperation);
		}

		return response.status(StatusCodes.OK).json({});
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
		let customer: CustomerEntity | null;
		let paymentAccount: PaymentAccountEntity | null;

		// 1. Get logTo UserId from request body
		const { username } = request.body;

		try {
			// 2. Check if the customer exists
			if (response.locals.customer) {
				customer = response.locals.customer as CustomerEntity;
			} else {
				// 2.1 Create customer
				customer = (await CustomerService.instance.create(username)) as CustomerEntity;
				if (!customer) {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: 'Customer creation failed',
					});
				}
			}

			// 3. Check if paymentAccount exists for the customer
			const accounts = await PaymentAccountService.instance.find({ customer });
			paymentAccount = accounts.find((account) => account.namespace === CheqdNetwork.Testnet) || null;
			if (paymentAccount === null) {
				const key = await new IdentityServiceStrategySetup(customer.customerId).agent.createKey(
					SupportedKeyTypes.Secp256k1,
					customer
				);
				if (!key) {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: 'PaymentAccount is not found in database: Key was not created',
					});
				}
				paymentAccount = (await PaymentAccountService.instance.create(
					CheqdNetwork.Testnet,
					true,
					customer,
					key
				)) as PaymentAccountEntity;
				if (!paymentAccount) {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: 'PaymentAccount is not found in database: Payment account was not created',
					});
				}
			}

			// 4. Check the token balance for Testnet account
			if (paymentAccount.address && process.env.ENABLE_ACCOUNT_TOPUP === 'true') {
				const balances = await checkBalance(paymentAccount.address, process.env.TESTNET_RPC_URL);
				const balance = balances[0];
				if (!balance || +balance.amount < TESTNET_MINIMUM_BALANCE * Math.pow(10, DEFAULT_DENOM_EXPONENT)) {
					// 3.1 If it's less then required for DID creation - assign new portion from testnet-faucet
					const resp = await FaucetHelper.delegateTokens(paymentAccount.address);

					if (resp.status !== StatusCodes.OK) {
						return response.status(StatusCodes.BAD_GATEWAY).json({
							error: resp.error,
						});
					}
				}
			}
			// 5. Setup stripe account
			if (process.env.STRIPE_ENABLED === 'true' && customer.paymentProviderId === null) {
				eventTracker.submit({
					operation: OperationNameEnum.STRIPE_ACCOUNT_CREATE,
					data: {
						name: customer.name,
						email: customer.email,
						customerId: customer.customerId,
					} satisfies ISubmitStripeCustomerCreateData,
				} satisfies ISubmitOperation);
			}
			return response.status(StatusCodes.CREATED).json(customer);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal Error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
