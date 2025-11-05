// src/controllers/api/providers.controller.ts
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IIdentifier } from '@veramo/core';
import { ProviderService } from '../../services/api/provider.service.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import { validate } from '../validator/decorator.js';
import { DockIdentityService } from '../../services/identity/providers/index.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { IDIDTrack, ITrackOperation } from '../../types/track.js';
import { eventTracker } from '../../services/track/tracker.js';
import { check, param } from '../validator/index.js';

export class ProvidersController {
	public static importDIDValidator = [
		check('did').exists().isDID().bail(),
		param('providerId').exists().withMessage('providerId is required').isString().bail(),
	];

	/**
	 * @openapi
	 * /providers:
	 *   get:
	 *     tags: [Providers]
	 *     summary: Get all available credential providers
	 *     description: Returns list of available credential providers
	 *     responses:
	 *       200:
	 *         description: Successful response
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 providers:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 */
	async getProviders(req: Request, res: Response) {
		try {
			const providers = await ProviderService.instance.getAllProviders();
			return res.status(StatusCodes.OK).json({ providers });
		} catch (error) {
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 * /providers/activated:
	 *   get:
	 *     tags: [Providers]
	 *     summary: Get customer's activated providers
	 *     description: Returns list of providers activated by the customer
	 *     responses:
	 *       200:
	 *         description: Successful response
	 */
	async getActiveProviders(req: Request, res: Response) {
		try {
			const customer = res.locals.customer as CustomerEntity;
			const configurations = await ProviderService.instance.getCustomerConfigurations(customer.customerId);

			const configuredProviders = configurations.map((config) => ({
				configId: config.configId,
				providerId: config.providerId,
				tenantId: config.tenantId,
				providerName: config.provider.name,
				providerType: config.provider.providerType,
				apiEndpoint: config.apiEndpoint,
				webhookUrl: config.webhookUrl,
				validated: config.validated,
				validatedAt: config.validatedAt,
				active: config.active,
				defaultSettings: config.defaultSettings,
				createdAt: config.createdAt,
				updatedAt: config.updatedAt,
			}));

			return res.status(StatusCodes.OK).json({ providers: configuredProviders });
		} catch (error) {
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 * /providers/{providerId}/configuration:
	 *   get:
	 *     tags: [Providers]
	 *     summary: Get provider configuration
	 *     parameters:
	 *       - name: providerId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Provider configuration
	 */
	async getProviderConfiguration(req: Request, res: Response) {
		try {
			const customer = res.locals.customer as CustomerEntity;
			const { providerId } = req.params;

			const config = await ProviderService.instance.getProviderConfiguration(customer.customerId, providerId);

			if (!config) {
				return res.status(StatusCodes.NOT_FOUND).json({
					error: `No configuration found for provider ${providerId}`,
				});
			}

			// Don't return encrypted API key
			const safeConfig = {
				configId: config.configId,
				providerId: config.providerId,
				tenantId: config.tenantId,
				apiEndpoint: config.apiEndpoint,
				webhookUrl: config.webhookUrl,
				validated: config.validated,
				validatedAt: config.validatedAt,
				active: config.active,
				defaultSettings: config.defaultSettings,
				hasApiKey: !!config.encryptedApiKey,
				provider: {
					name: config.provider.name,
					description: config.provider.description,
					providerType: config.provider.providerType,
					supportedFormats: config.provider.supportedFormats,
					supportedProtocols: config.provider.supportedProtocols,
					metadata: config.provider.metadata,
				},
			};

			return res.status(StatusCodes.OK).json({ configuration: safeConfig });
		} catch (error) {
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 * /providers/{providerId}/activate:
	 *   post:
	 *     tags: [Providers]
	 *     summary: Activate a provider for the customer
	 *     parameters:
	 *       - name: providerId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Provider activated successfully
	 *       400:
	 *         description: Invalid provider or already activated
	 *       404:
	 *         description: Provider not found
	 */
	async activateProvider(req: Request, res: Response) {
		try {
			const customer = res.locals.customer as CustomerEntity;
			const { providerId } = req.params;

			const config = await ProviderService.instance.activateProvider(customer.customerId, providerId);

			return res.status(StatusCodes.OK).json({
				message: 'Provider activated successfully',
				configuration: {
					configId: config.configId,
					providerId: config.providerId,
					tenantId: config.tenantId,
					providerName: config.provider.name,
					apiEndpoint: config.apiEndpoint,
					active: config.active,
					createdAt: config.createdAt,
				},
			});
		} catch (error) {
			const status = (error as Error)?.message.includes('not found')
				? StatusCodes.NOT_FOUND
				: (error as Error)?.message.includes('already activated')
					? StatusCodes.CONFLICT
					: StatusCodes.BAD_REQUEST;

			return res.status(status).json({
				error: `Activation failed: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 * /providers/{providerId}/configuration:
	 *   put:
	 *     tags: [Providers]
	 *     summary: Update provider configuration
	 *     parameters:
	 *       - name: providerId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               apiEndpoint:
	 *                 type: string
	 *                 format: uri
	 *                 description: API endpoint URL
	 *               webhookUrl:
	 *                 type: string
	 *                 format: uri
	 *                 description: Webhook URL for notifications
	 *               defaultSettings:
	 *                 type: object
	 *                 description: Provider-specific default settings
	 *     responses:
	 *       200:
	 *         description: Configuration updated successfully
	 *       400:
	 *         description: Invalid configuration data
	 *       404:
	 *         description: Provider configuration not found
	 */
	async updateProviderConfiguration(req: Request, res: Response) {
		try {
			const customer = res.locals.customer as CustomerEntity;
			const { providerId } = req.params;
			const { apiEndpoint, webhookUrl, defaultSettings } = req.body;

			// Validate input
			if (apiEndpoint && typeof apiEndpoint !== 'string') {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: 'Invalid API endpoint: must be a string',
				});
			}

			if (webhookUrl && typeof webhookUrl !== 'string') {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: 'Invalid webhook URL: must be a string',
				});
			}

			if (process.env.APPLICATION_BASE_URL?.includes('localhost')) {
				console.warn('Skipping URL validation in local development environment');
			} else {
				if (apiEndpoint && !apiEndpoint.startsWith('https://')) {
					return res.status(StatusCodes.BAD_REQUEST).json({
						error: 'API endpoint must be a valid HTTPS URL',
					});
				}

				if (webhookUrl && webhookUrl.trim() && !webhookUrl.startsWith('https://')) {
					return res.status(StatusCodes.BAD_REQUEST).json({
						error: 'Webhook URL must be a valid HTTPS URL',
					});
				}
			}

			const updatedConfig = await ProviderService.instance.updateProviderConfiguration(
				customer.customerId,
				providerId,
				{
					apiEndpoint: apiEndpoint?.trim() || undefined,
					webhookUrl: webhookUrl?.trim() || undefined,
					defaultSettings: defaultSettings || undefined,
				}
			);

			const safeConfig = {
				configId: updatedConfig.configId,
				providerId: updatedConfig.providerId,
				apiEndpoint: updatedConfig.apiEndpoint,
				webhookUrl: updatedConfig.webhookUrl,
				validated: updatedConfig.validated,
				validatedAt: updatedConfig.validatedAt,
				active: updatedConfig.active,
				defaultSettings: updatedConfig.defaultSettings,
				hasApiKey: !!updatedConfig.encryptedApiKey,
				updatedAt: updatedConfig.updatedAt,
			};

			return res.status(StatusCodes.OK).json({
				message: 'Provider configuration updated successfully',
				data: safeConfig,
			});
		} catch (error) {
			const status = (error as Error)?.message.includes('not found')
				? StatusCodes.NOT_FOUND
				: StatusCodes.BAD_REQUEST;

			return res.status(status).json({
				error: `Configuration update failed: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 * /providers/{providerId}/test:
	 *   post:
	 *     tags: [Providers]
	 *     summary: Test connection to a provider
	 *     parameters:
	 *       - name: providerId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - name: newAPIUrl
	 *         in: query
	 *         required: false
	 *         default: null
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Connection test completed
	 *       400:
	 *         description: Connection test failed
	 *       404:
	 *         description: Provider configuration not found
	 */
	async testConnection(req: Request, res: Response) {
		try {
			const customer = res.locals.customer as CustomerEntity;
			const { providerId } = req.params;
			const newAPIUrl = req.query?.newAPIUrl as string | undefined;
			const result = await ProviderService.instance.testConnection(customer.customerId, providerId, newAPIUrl);

			const statusCode = result.success ? StatusCodes.OK : StatusCodes.BAD_REQUEST;

			return res.status(statusCode).json({
				providerId,
				success: result.success,
				message: result.message,
				testedAt: new Date().toISOString(),
			});
		} catch (error) {
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Connection test failed: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 * /providers/{providerId}:
	 *   delete:
	 *     tags: [Providers]
	 *     summary: Remove provider configuration
	 *     parameters:
	 *       - name: providerId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Configuration removed successfully
	 */
	async removeProvider(req: Request, res: Response) {
		try {
			const customer = res.locals.customer as CustomerEntity;
			const { providerId } = req.params;

			await ProviderService.instance.deleteConfiguration(customer.customerId, providerId);

			return res.status(StatusCodes.OK).json({
				message: `Provider ${providerId} configuration removed successfully`,
			});
		} catch (error) {
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /providers/{providerId}/did/import:
	 *   post:
	 *     tags: [ Providers ]
	 *     summary: Import a DID into a Provider.
	 *     description: This endpoint imports a decentralized identifier associated with the user's account with the custodied keys into a provider.
	 *     parameters:
	 *       - name: providerId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - did
	 *             properties:
	 *               did:
	 *                 description: DID identifier to resolve.
	 *                 type: string
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - did
	 *             properties:
	 *               did:
	 *                 description: DID identifier to resolve.
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/DidResult'
	 *       400:
	 *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: InvalidRequest
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: Internal Error
	 */
	@validate
	public async importDid(request: Request, response: Response) {
		try {
			const { providerId } = request.params;
			const { did } = request.body;
			let importedResult: IIdentifier;
			switch (providerId) {
				case 'dock':
					const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer);
					const exportedResult = await identityServiceStrategySetup.agent.exportDid(
						did,
						process.env.PROVIDER_EXPORT_PASSWORD || '',
						response.locals.customer
					);
					importedResult = await new DockIdentityService().importDidV2(
						did,
						exportedResult,
						process.env.PROVIDER_EXPORT_PASSWORD || '',
						response.locals.customer
					);
					break;
				default:
					throw new Error(`Importing into provider ${providerId || 'studio'} is not supported`);
			}
			// Track the operation
			eventTracker.emit('track', {
				category: OperationCategoryNameEnum.DID,
				name: OperationNameEnum.DID_EXPORT,
				data: {
					did: did,
				},
				customer: response.locals.customer,
				user: response.locals.user,
			} satisfies ITrackOperation<IDIDTrack>);

			return response.status(StatusCodes.OK).json({
				status: true,
				...importedResult,
			});
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
