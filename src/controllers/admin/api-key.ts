import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import { check } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { APIKeyService } from '../../services/admin/api-key.js';
import { apiKeyExpiryProblem, isAPIKeyExpired } from '../../services/admin/api-key-expiry.js';
import type {
	APIKeyCreateRequestBody,
	APIKeyCreateResponseBody,
	APIKeyCreateUnsuccessfulResponseBody,
	APIKeyGetResponseBody,
	APIKeyGetUnsuccessfulResponseBody,
	APIKeyListResponseBody,
	APIKeyListUnsuccessfulResponseBody,
	APIKeyResponseBody,
	APIKeyRevokeRequestBody,
	APIKeyRevokeResponseBody,
	APIKeyRevokeUnsuccessfulResponseBody,
	APIKeyUpdateRequestBody,
	APIKeyUpdateResponseBody,
	APIKeyUpdateUnsuccessfulResponseBody,
	APIServiceOptions,
} from '../../types/admin.js';
import { EventTracker, eventTracker } from '../../services/track/tracker.js';
import { API_KEY_MAX_ACTIVE_PER_CUSTOMER, OperationNameEnum } from '../../types/constants.js';

dotenv.config();

export class APIKeyController {
	static apiKeyCreateValidator = [
		check('expiresAt')
			.optional()
			.isISO8601()
			.toDate()
			.withMessage('Invalid date format')
			.custom((value) => {
				const problem = apiKeyExpiryProblem(value);
				if (problem) {
					throw new Error(problem);
				}
				return true;
			})
			.toDate()
			.bail(),
		check('name')
			.exists()
			.withMessage('Name is not specified')
			.bail()
			.isString()
			.withMessage('Invalid name')
			.bail(),
	];
	static apiKeyUpdateValidator = [
		check('apiKey')
			.exists()
			.withMessage('API key is not specified')
			.bail()
			.isString()
			.withMessage('Invalid API key')
			.bail(),
		check('expiresAt')
			.optional()
			.isISO8601()
			.toDate()
			.withMessage('Invalid date format')
			.custom((value) => {
				const problem = apiKeyExpiryProblem(value);
				if (problem) {
					throw new Error(problem);
				}
				return true;
			})
			.toDate()
			.bail(),
		check('revoked').optional().isBoolean().withMessage('Invalid boolean value').bail(),
		check('name').optional().isString().withMessage('Invalid name').bail(),
	];
	static apiKeyRevokeValidator = [
		check('apiKey')
			.exists()
			.withMessage('API key is not specified')
			.bail()
			.isString()
			.withMessage('Invalid API key')
			.bail(),
	];
	static apiKeyListValidator = [
		// No validation
	];
	static apiKeyGetValidator = [check('apiKey').optional().isString().withMessage('Invalid API key').bail()];

	/**
	 * @openapi
	 *
	 * /admin/api-key/create:
	 *   post:
	 *     summary: Create a new API key
	 *     description: Create a new API key
	 *     tags: [API Key]
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/APIKeyCreateRequestBody'
	 *     responses:
	 *       201:
	 *         description: A new API key has been created
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/APIKeyResponse'
	 *       400:
	 *         $ref: '#/components/schemas/APIKeyCreateUnsuccessfulResponseBody'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       409:
	 *         description: The account already holds the maximum number of active API keys (API_KEY_MAX_ACTIVE_PER_CUSTOMER, default 10). Revoke one first.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async create(request: Request, response: Response) {
		const { name, expiresAt } = request.body satisfies APIKeyCreateRequestBody;
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;

		try {
			// Cap how many live keys one customer can hold, so a retry loop or a misused token cannot pile them up
			const activeKeys = await APIKeyService.instance.countActive(response.locals.customer);
			if (activeKeys >= API_KEY_MAX_ACTIVE_PER_CUSTOMER) {
				return response.status(StatusCodes.CONFLICT).json({
					error: `API key limit reached: an account can hold at most ${API_KEY_MAX_ACTIVE_PER_CUSTOMER} active API keys. Revoke a key you no longer use, then try again.`,
				} satisfies APIKeyCreateUnsuccessfulResponseBody);
			}
			const apiKey = await APIKeyService.generateAPIKey(response.locals.user.logToId as string);
			const apiKeyEntity = await APIKeyService.instance.create(
				apiKey,
				name,
				response.locals.user,
				response.locals.customer,
				expiresAt,
				false,
				options
			);
			if (!apiKeyEntity) {
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					message: 'Cannot create a new API key',
				});
			}
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`API key for customer: ${response.locals.customer.customerId} has been created`,
					OperationNameEnum.API_KEY_CREATE
				),
				severity: 'info',
			});
			return response.status(StatusCodes.CREATED).json({
				apiKey: apiKeyEntity.apiKey,
				name: apiKeyEntity.name,
				createdAt: apiKeyEntity.createdAt.toISOString(),
				expiresAt: apiKeyEntity.expiresAt.toISOString(),
				revoked: apiKeyEntity.revoked,
				expired: isAPIKeyExpired(apiKeyEntity.expiresAt),
			} satisfies APIKeyCreateResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies APIKeyCreateUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/api-key/update:
	 *  post:
	 *   summary: Update an existing API key
	 *   description: Update an existing API key
	 *   tags: [API Key]
	 *   requestBody:
	 *    content:
	 *     application/json:
	 *      schema:
	 *       $ref: '#/components/schemas/APIKeyUpdateRequestBody'
	 *   responses:
	 *    200:
	 *     description: The API key has been updated
	 *     content:
	 *      application/json:
	 *       schema:
	 *        $ref: '#/components/schemas/APIKeyUpdateResponseBody'
	 *    400:
	 *     $ref: '#/components/schemas/APIKeyUpdateUnsuccessfulResponseBody'
	 *    401:
	 *     $ref: '#/components/schemas/UnauthorizedError'
	 *    500:
	 *     $ref: '#/components/schemas/InternalError'
	 *
	 */
	@validate
	public async update(request: Request, response: Response) {
		const { apiKey, name, expiresAt, revoked } = request.body satisfies APIKeyUpdateRequestBody;
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;
		try {
			const apiKeyEntity = await APIKeyService.instance.update(
				{
					apiKey,
					name,
					expiresAt,
					revoked,
				},
				options
			);
			if (!apiKeyEntity) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: 'Update failed: API key does not exist',
				} satisfies APIKeyUpdateUnsuccessfulResponseBody);
			}

			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`API key for customer: ${response.locals.customer.customerId} has been updated`,
					OperationNameEnum.API_KEY_UPDATE
				),
				severity: 'info',
			});
			return response.status(StatusCodes.OK).json({
				apiKey: apiKeyEntity.apiKey,
				name: apiKeyEntity.name,
				createdAt: apiKeyEntity.createdAt.toISOString(),
				expiresAt: apiKeyEntity.expiresAt.toISOString(),
				revoked: apiKeyEntity.revoked,
				expired: isAPIKeyExpired(apiKeyEntity.expiresAt),
			} satisfies APIKeyUpdateResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies APIKeyUpdateUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/api-key/revoke:
	 *  delete:
	 *   summary: Revoke an existing API key
	 *   description: Revoke an existing API key
	 *   tags: [API Key]
	 *   requestBody:
	 *    content:
	 *     application/json:
	 *      schema:
	 *       $ref: '#/components/schemas/APIKeyRevokeRequestBody'
	 *   responses:
	 *    200:
	 *     description: The API key has been revoked
	 *     content:
	 *      application/json:
	 *       schema:
	 *        $ref: '#/components/schemas/APIKeyRevokeResponseBody'
	 *    400:
	 *     $ref: '#/components/schemas/APIKeyRevokeUnsuccessfulResponseBody'
	 *    401:
	 *     $ref: '#/components/schemas/UnauthorizedError'
	 *    500:
	 *     $ref: '#/components/schemas/InternalError'
	 *
	 */
	@validate
	public async revoke(request: Request, response: Response) {
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;
		const { apiKey } = request.body satisfies APIKeyRevokeRequestBody;
		try {
			const apiKeyEntity = await APIKeyService.instance.revoke(apiKey, options);
			if (!apiKeyEntity) {
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: 'Cannot revoke API key',
				} satisfies APIKeyRevokeUnsuccessfulResponseBody);
			}
			await eventTracker.notify({
				message: EventTracker.compileBasicNotification(
					`API key for customer: ${response.locals.customer.customerId} has been revoked`,
					OperationNameEnum.API_KEY_REVOKE
				),
				severity: 'info',
			});
			return response.status(StatusCodes.OK).json({
				apiKey: apiKeyEntity.apiKey,
				revoked: apiKeyEntity.revoked,
			} satisfies APIKeyRevokeResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies APIKeyRevokeUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/api-key/list:
	 *  get:
	 *   summary: List all API keys
	 *   description: List all API keys
	 *   tags: [API Key]
	 *   responses:
	 *    200:
	 *     description: A list of API keys
	 *     content:
	 *      application/json:
	 *       schema:
	 *        $ref: '#/components/schemas/APIKeyListResponseBody'
	 *    400:
	 *      $ref: '#/components/schemas/InvalidRequest'
	 *    401:
	 *      $ref: '#/components/schemas/UnauthorizedError'
	 *    500:
	 *      $ref: '#/components/schemas/InternalError'
	 *    404:
	 *      $ref: '#/components/schemas/NotFoundError'
	 *
	 */
	@validate
	public async list(request: Request, response: Response) {
		try {
			const options = { decryptionNeeded: true } satisfies APIServiceOptions;
			const apiKeyList = await APIKeyService.instance.find(
				{
					customer: response.locals.customer,
				},
				undefined,
				options
			);
			const keys = apiKeyList.map((apiKey) => {
				return {
					apiKey: apiKey.apiKey,
					name: apiKey.name,
					createdAt: apiKey.createdAt.toISOString(),
					expiresAt: apiKey.expiresAt.toISOString(),
					revoked: apiKey.revoked,
					expired: isAPIKeyExpired(apiKey.expiresAt),
				} satisfies APIKeyResponseBody;
			});
			return response.status(StatusCodes.OK).json({
				apiKeys: keys,
			} satisfies APIKeyListResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies APIKeyListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /admin/api-key/get:
	 *  get:
	 *   summary: Get an API key
	 *   description: Get an API key. If the API key is not provided, the latest not revoked API key it returns.
	 *   tags: [API Key]
	 *   parameters:
	 *    - name: apiKey
	 *      in: query
	 *      required: false
	 *      schema:
	 *       type: string
	 *   responses:
	 *    200:
	 *     description: The API key
	 *     content:
	 *      application/json:
	 *       schema:
	 *        $ref: '#/components/schemas/APIKeyGetResponseBody'
	 *    400:
	 *      $ref: '#/components/schemas/InvalidRequest'
	 *    401:
	 *      $ref: '#/components/schemas/UnauthorizedError'
	 *    500:
	 *      $ref: '#/components/schemas/InternalError'
	 *    404:
	 *      $ref: '#/components/schemas/NotFoundError'
	 *
	 */
	@validate
	public async get(request: Request, response: Response) {
		const apiKey = request.query.apiKey as string;
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;

		try {
			if (apiKey) {
				const apiKeyEntity = await APIKeyService.instance.get(apiKey, options);
				if (!apiKeyEntity) {
					return response.status(StatusCodes.NOT_FOUND).json({
						error: 'API key not found',
					});
				}
				return response.status(StatusCodes.OK).json({
					apiKey: apiKeyEntity.apiKey,
					name: apiKeyEntity.name,
					createdAt: apiKeyEntity.createdAt.toISOString(),
					expiresAt: apiKeyEntity.expiresAt.toISOString(),
					revoked: apiKeyEntity.revoked,
					expired: isAPIKeyExpired(apiKeyEntity.expiresAt),
				} satisfies APIKeyGetResponseBody);
			}
			// Otherwise try to get the latest not revoked API key
			const key = await APIKeyService.instance.findOne(
				{
					customer: response.locals.customer,
					revoked: false,
				},
				undefined,
				options,
				{
					createdAt: 'DESC',
				}
			);
			if (!key) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: 'API key not found',
				});
			}
			return response.status(StatusCodes.OK).json({
				apiKey: key.apiKey,
				name: key.name,
				createdAt: key.createdAt.toISOString(),
				expiresAt: key.expiresAt.toISOString(),
				revoked: key.revoked,
				expired: isAPIKeyExpired(key.expiresAt),
			} satisfies APIKeyGetResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies APIKeyGetUnsuccessfulResponseBody);
		}
	}
}
