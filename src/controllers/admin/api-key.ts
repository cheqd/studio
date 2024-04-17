import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { StatusCodes } from 'http-status-codes';
import { check } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { APIKeyService } from '../../services/admin/api-key.js';
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
import { OperationNameEnum } from '../../types/constants.js';

dotenv.config();

export class APIKeyController {
	static apiKeyCreateValidator = [
		check('expiresAt')
			.optional()
			.isISO8601()
			.toDate()
			.withMessage('Invalid date format')
			.custom((value) => {
				const current = new Date();
				if (value < new Date(current.toISOString())) {
					throw new Error('expiresAt must be in the future');
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
				const current = new Date();
				if (value < new Date(current.toISOString())) {
					throw new Error('expiresAt must be in the future');
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
	 *               $ref: '#/components/schemas/APIKeyCreateResponseBody'
	 *       400:
	 *         $ref: '#/components/schemas/APIKeyCreateUnsuccessfulResponseBody'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async create(request: Request, response: Response) {
		const { name, expiresAt } = request.body satisfies APIKeyCreateRequestBody;
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;

		try {
			const apiKey = await APIKeyService.generateAPIKey(response.locals.user.logToId as string);
			const apiKeyEntity = await APIKeyService.instance.create(
				apiKey,
				name,
				response.locals.user,
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
			} satisfies APIKeyCreateResponseBody);
		} catch (error) {
			return response.status(500).json({
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
				} satisfies APIKeyGetResponseBody);
			}
			// Otherwise try to get the latest not revoked API key
			const keys = await APIKeyService.instance.find(
				{
					customer: response.locals.customer,
					revoked: false,
				},
				{
					createdAt: 'DESC',
				},
				options
			);
			if (keys.length == 0) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: 'API key not found',
				});
			}
			return response.status(StatusCodes.OK).json({
				apiKey: keys[0].apiKey,
				name: keys[0].name,
				createdAt: keys[0].createdAt.toISOString(),
				expiresAt: keys[0].expiresAt.toISOString(),
				revoked: keys[0].revoked,
			} satisfies APIKeyGetResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies APIKeyGetUnsuccessfulResponseBody);
		}
	}
}
