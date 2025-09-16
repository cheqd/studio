import { Repository } from 'typeorm';
import { Connection } from '../../../database/connection/connection.js';
import { CredentialProviderEntity } from '../../../database/entities/credential-provider.entity.js';
import { ProviderConfigurationEntity } from '../../../database/entities/provider-configuration.entity.js';
import { CustomerEntity } from '../../../database/entities/customer.entity.js';
import { APIKeyService } from '../../admin/api-key.js';
import { ProviderFactory } from './provider.factory.js';
import { ConnectionTestResult } from '../../../types/provider.types.js';

export class ProviderService {
	public providerRepository: Repository<CredentialProviderEntity>;
	public configRepository: Repository<ProviderConfigurationEntity>;

	public static instance = new ProviderService();

	constructor() {
		this.providerRepository = Connection.instance.dbConnection.getRepository(CredentialProviderEntity);
		this.configRepository = Connection.instance.dbConnection.getRepository(ProviderConfigurationEntity);
	}

	// Provider Management
	async getAllProviders(): Promise<CredentialProviderEntity[]> {
		return await this.providerRepository.find({
			order: { name: 'ASC' },
		});
	}

	async getProvider(providerId: string): Promise<CredentialProviderEntity | null> {
		return await this.providerRepository.findOne({
			where: { providerId },
		});
	}

	async createProvider(providerData: Partial<CredentialProviderEntity>): Promise<CredentialProviderEntity> {
		const provider = this.providerRepository.create(providerData);
		return await this.providerRepository.save(provider);
	}

	// Provider Activation - for fixed providers only
	async activateProvider(
		customerId: string,
		providerId: string,
		customApiEndpoint?: string
	): Promise<ProviderConfigurationEntity> {
		// Check if provider exists and is a valid default provider
		const provider = await this.getProvider(providerId);
		if (!provider) {
			throw new Error(`Provider ${providerId} not found`);
		}

		// Get customer entity
		const customerRepository = Connection.instance.dbConnection.getRepository(CustomerEntity);
		const customer = await customerRepository.findOne({
			where: { customerId },
		});
		if (!customer) {
			throw new Error(`Customer ${customerId} not found`);
		}

		// Check if already activated
		const existingConfig = await this.getProviderConfiguration(customerId, providerId);
		if (existingConfig) {
			throw new Error(`Provider ${providerId} is already activated for customer ${customerId}`);
		}

		// Use factory pattern
		const providerService = await ProviderFactory.getProviderService(providerId);
		const { apiKey, settings } = await providerService.activateProvider(customer);

		// Encrypt API key
		const encryptedApiKey = await APIKeyService.instance.encryptAPIKey(apiKey);

		// Determine API endpoint (priority: custom > provider default > fallback)
		const apiEndpoint = customApiEndpoint || provider.metadata.apiUrl || 'http://localhost:3000';

		// Create configuration
		const config = new ProviderConfigurationEntity(
			providerId,
			settings.tenantId,
			encryptedApiKey,
			apiEndpoint,
			customer,
			provider,
			undefined,
			settings
		);

		config.active = true; // Mark as active after successful activation

		return await this.configRepository.save(config);
	}

	// Configuration Management
	async getProviderConfiguration(
		customerId: string,
		providerId: string
	): Promise<ProviderConfigurationEntity | null> {
		return await this.configRepository.findOne({
			where: {
				customer: { customerId },
				providerId,
			},
			relations: ['provider', 'customer'],
		});
	}

	async getCustomerConfigurations(customerId: string): Promise<ProviderConfigurationEntity[]> {
		return await this.configRepository.find({
			where: { customer: { customerId } },
			relations: ['provider'],
			order: { createdAt: 'DESC' },
		});
	}

	async updateProviderConfiguration(
		customerId: string,
		providerId: string,
		updates: Partial<{
			apiEndpoint: string;
			webhookUrl: string;
			defaultSettings: any;
		}>
	): Promise<ProviderConfigurationEntity> {
		const config = await this.getProviderConfiguration(customerId, providerId);

		if (!config) {
			throw new Error(`Provider configuration not found for provider ${providerId}`);
		}

		// Update fields
		if (updates.apiEndpoint !== undefined) {
			config.apiEndpoint = updates.apiEndpoint;
		}
		if (updates.webhookUrl !== undefined) {
			config.webhookUrl = updates.webhookUrl;
		}
		if (updates.defaultSettings !== undefined) {
			config.defaultSettings = { ...config.defaultSettings, ...updates.defaultSettings };
		}

		// Mark as updated
		config.updatedAt = new Date();

		// Reset validation status when configuration changes
		config.validated = false;
		config.validatedAt = undefined;

		return await this.configRepository.save(config);
	}

	async deleteConfiguration(customerId: string, providerId: string): Promise<void> {
		// Get the configuration before deleting to clean up provider resources
		const config = await this.getProviderConfiguration(customerId, providerId);
		if (config && ProviderFactory.isProviderSupported(providerId)) {
			try {
				const providerService = await ProviderFactory.getProviderService(providerId);
				await providerService.cleanupProviderResources(config);
			} catch (error) {
				console.warn(`Failed to clean up ${providerId} resources:`, error);
			}
		}

		await this.configRepository.delete({
			customer: { customerId },
			providerId,
		});
	}

	// Decrypt API key for use
	async getDecryptedApiKey(config: ProviderConfigurationEntity): Promise<string> {
		return await APIKeyService.instance.decryptAPIKey(config.encryptedApiKey);
	}

	// Test connection functionality
	async testConnection(customerId: string, providerId: string): Promise<ConnectionTestResult> {
		const config = await this.getProviderConfiguration(customerId, providerId);
		if (!config) {
			return { success: false, message: 'Provider not activated for this customer' };
		}
		try {
			if (ProviderFactory.isProviderSupported(providerId)) {
				const providerService = await ProviderFactory.getProviderService(providerId);
				const result = await providerService.testProviderConfiguration(config);
				if (result.success) {
					config.validated = true;
					config.validatedAt = new Date();
					await this.configRepository.save(config);
				}

				return result;
			} else {
				return { success: false, message: `Test connection not implemented for ${providerId}` };
			}
		} catch (error) {
			return { success: false, message: `Connection test failed: ${(error as Error).message}` };
		}
	}
}
