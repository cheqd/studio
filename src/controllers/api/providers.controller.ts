// src/controllers/api/providers.controller.ts
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ProviderService } from '../../services/api/provider.service.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';

export class ProvidersController {
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
				providerName: config.provider.name,
				providerType: config.provider.providerType,
				apiEndpoint: config.apiEndpoint,
				webhookUrl: config.webhookUrl,
				validated: config.validated,
				validatedAt: config.validatedAt,
				active: config.active,
				capabilities: config.capabilities,
				defaultSettings: config.defaultSettings,
				createdAt: config.createdAt,
				updatedAt: config.updatedAt,
				lastHealthCheck: config.lastHealthCheck,
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
				apiEndpoint: config.apiEndpoint,
				webhookUrl: config.webhookUrl,
				validated: config.validated,
				validatedAt: config.validatedAt,
				active: config.active,
				capabilities: config.capabilities,
				defaultSettings: config.defaultSettings,
				hasApiKey: !!config.encryptedApiKey,
				provider: {
					name: config.provider.name,
					description: config.provider.description,
					providerType: config.provider.providerType,
					supportedFormats: config.provider.supportedFormats,
					supportedProtocols: config.provider.supportedProtocols,
					capabilities: config.provider.capabilities,
					logoUrl: config.provider.logoUrl,
					documentationUrl: config.provider.documentationUrl,
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
					providerName: config.provider.name,
					apiEndpoint: config.apiEndpoint,
					active: config.active,
					capabilities: config.capabilities,
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

			const result = await ProviderService.instance.testConnection(customer.customerId, providerId);

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
}
