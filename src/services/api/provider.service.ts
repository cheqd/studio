import { Repository } from 'typeorm';
import { Connection } from '../../database/connection/connection.js';
import { CredentialProviderEntity } from '../../database/entities/credential-provider.entity.js';
import { ProviderConfigurationEntity } from '../../database/entities/provider-configuration.entity.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import { EncryptionService } from './encryption.service.js';
import { DockApiService } from './dock-api.service.js';
import { HoviApiService } from './hovi-api.service.js';
import { ParadymApiService } from './paradym-api.service.js';
import { APIKeyService } from '../admin/api-key.js';
import { UserEntity } from '../../database/entities/user.entity.js';
import { APIServiceOptions } from '../../types/admin.js';

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
	async activateProvider(customerId: string, providerId: string): Promise<ProviderConfigurationEntity> {
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

		let apiKey: string;
		let apiEndpoint: string;
		let defaultSettings: any = {};

		// Handle provider-specific activation
		// Use the API URL from the provider definition
		apiEndpoint = provider.apiUrl || 'http://localhost:3000';

		switch (providerId) {
			case 'studio':
				// For Studio, use existing API key or create new one
				apiKey = await this.getOrCreateStudioApiKey(customer);
				break;

			case 'dock':
				// For Dock, create subaccount and API key
				const dockResult = await this.activateDockProvider(customer);
				apiKey = dockResult.apiKey;
				defaultSettings = dockResult.settings;
				break;

			case 'hovi':
				// For HOVI, use master API key and create tenant
				const hoviResult = await this.activateHoviProvider(customer);
				apiKey = hoviResult.apiKey;
				defaultSettings = hoviResult.settings;
				break;

			case 'paradym':
				// For Paradym, use master API key and create tenant
				const paradymResult = await this.activateParadymProvider(customer);
				apiKey = paradymResult.apiKey;
				defaultSettings = paradymResult.settings;
				break;

			default:
				throw new Error(`Provider activation not implemented for ${providerId}`);
		}

		// Encrypt API key
		const encryptedApiKey = await EncryptionService.instance.encrypt(apiKey);

		// Create configuration
		const config = new ProviderConfigurationEntity(
			providerId,
			JSON.stringify(encryptedApiKey),
			apiEndpoint,
			customer,
			provider,
			undefined, // webhookUrl
			provider.capabilities,
			defaultSettings
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

	async updateConfiguration(
		configId: string,
		updates: Partial<{
			apiEndpoint: string;
			webhookUrl: string;
			capabilities: string[];
			defaultSettings: any;
			active: boolean;
			validated: boolean;
		}>
	): Promise<ProviderConfigurationEntity> {
		const config = await this.configRepository.findOne({
			where: { configId },
			relations: ['provider', 'customer'],
		});

		if (!config) {
			throw new Error(`Configuration ${configId} not found`);
		}

		// Update fields
		if (updates.apiEndpoint) config.apiEndpoint = updates.apiEndpoint;
		if (updates.webhookUrl !== undefined) config.webhookUrl = updates.webhookUrl;
		if (updates.capabilities) config.capabilities = updates.capabilities;
		if (updates.defaultSettings) config.defaultSettings = updates.defaultSettings;
		if (updates.active !== undefined) config.active = updates.active;
		if (updates.validated !== undefined) {
			config.validated = updates.validated;
			config.validatedAt = updates.validated ? new Date() : undefined;
		}

		return await this.configRepository.save(config);
	}

	async deleteConfiguration(customerId: string, providerId: string): Promise<void> {
		// Get the configuration before deleting to clean up provider resources
		const config = await this.getProviderConfiguration(customerId, providerId);

		if (config) {
			try {
				switch (providerId) {
					case 'dock':
						if (config.defaultSettings?.subaccountId) {
							await DockApiService.instance.deleteSubaccount(config.defaultSettings.subaccountId);
						}
						break;
					case 'hovi':
						if (config.defaultSettings?.tenantId) {
							await HoviApiService.instance.deleteTenant(config.defaultSettings.tenantId);
						}
						break;
					case 'paradym':
						if (config.defaultSettings?.organizationId) {
							await ParadymApiService.instance.deleteOrganization(config.defaultSettings.organizationId);
						}
						break;
				}
			} catch (error) {
				console.warn(`Failed to clean up ${providerId} resources:`, error);
				// Continue with deletion even if cleanup fails
			}
		}

		await this.configRepository.delete({
			customer: { customerId },
			providerId,
		});
	}

	// Decrypt API key for use
	async getDecryptedApiKey(config: ProviderConfigurationEntity): Promise<string> {
		const encryptedData = JSON.parse(config.encryptedApiKey);
		return await EncryptionService.instance.decrypt(encryptedData.encrypted, encryptedData.iv, encryptedData.tag);
	}

	// Private helper methods
	private async getOrCreateStudioApiKey(customer: CustomerEntity): Promise<string> {
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;
		// Check if customer has any existing API keys
		const existingApiKeys = await APIKeyService.instance.find(
			{
				customer,
				revoked: false,
			},
			undefined,
			options
		);

		// If existing API key found, use the first active one
		if (existingApiKeys && existingApiKeys.length > 0) {
			const activeKey = existingApiKeys.find((key) => key.expiresAt && key.expiresAt > new Date());

			if (activeKey && activeKey.apiKey) {
				return activeKey.apiKey;
			}
		}

		// No active API key found, create a new one
		// We need a user for API key creation - get or create a default user for this customer
		const defaultUser = await this.getDefaultUser(customer);

		// Generate new API key
		const newApiKey = APIKeyService.generateAPIKey(customer.customerId);

		// Create API key entity
		const apiKeyEntity = await APIKeyService.instance.create(
			newApiKey,
			`Studio API Key for ${customer.name || customer.email}`,
			defaultUser,
			customer,
			undefined, // Use default expiration
			false, // Not revoked
			{ decryptionNeeded: true }
		);

		return apiKeyEntity.apiKey || newApiKey;
	}

	private async getDefaultUser(customer: CustomerEntity): Promise<UserEntity> {
		const userRepository = Connection.instance.dbConnection.getRepository(UserEntity);

		// Try to find existing user for this customer
		const user = await userRepository.findOne({
			where: { customer: { customerId: customer.customerId } },
		});

		// If no user exists, throw error
		if (!user) {
			throw new Error(`logToId not found`);
		}
		return user;
	}

	// Provider-specific activation methods
	private async activateDockProvider(customer: CustomerEntity): Promise<{ apiKey: string; settings: any }> {
		const subaccount = await DockApiService.instance.createSubaccount(customer.customerId);
		const dockApiKey = await DockApiService.instance.createApiKeyForSubaccount(subaccount.id);

		return {
			apiKey: dockApiKey.token,
			settings: {
				subaccountId: subaccount.id,
				subaccountName: subaccount.name,
				dockApiKeyId: dockApiKey.id,
			},
		};
	}

	private async activateHoviProvider(customer: CustomerEntity): Promise<{ apiKey: string; settings: any }> {
		const tenant = await HoviApiService.instance.createTenant(
			customer.customerId,
			customer.name || customer.email || `Customer ${customer.customerId}`
		);

		const apiKeyData = await HoviApiService.instance.createApiKeyForTenant(
			tenant.id,
			customer.name || customer.email || `Customer ${customer.customerId}`
		);

		return {
			apiKey: apiKeyData.key,
			settings: {
				tenantId: tenant.id,
				tenantName: tenant.name,
				hoviApiKeyId: apiKeyData.id,
			},
		};
	}

	private async activateParadymProvider(customer: CustomerEntity): Promise<{ apiKey: string; settings: any }> {
		const organization = await ParadymApiService.instance.createOrganization(
			customer.customerId,
			customer.name || customer.email || `Customer ${customer.customerId}`
		);

		const apiKeyData = await ParadymApiService.instance.createApiKeyForOrganization(
			organization.id,
			customer.name || customer.email || `Customer ${customer.customerId}`
		);

		return {
			apiKey: apiKeyData.key,
			settings: {
				organizationId: organization.id,
				organizationName: organization.name,
				paradymApiKeyId: apiKeyData.id,
			},
		};
	}

	// Test connection functionality
	async testConnection(customerId: string, providerId: string): Promise<{ success: boolean; message: string }> {
		const config = await this.getProviderConfiguration(customerId, providerId);
		if (!config) {
			return { success: false, message: 'Provider not activated for this customer' };
		}

		try {
			const apiKey = await this.getDecryptedApiKey(config);
			switch (providerId) {
				case 'studio':
					return await this.testStudioConnection(apiKey, config.apiEndpoint);
				case 'dock':
					return await DockApiService.instance.testConnection(apiKey, config.defaultSettings?.subaccountId);
				case 'hovi':
					return await HoviApiService.instance.testConnection(apiKey, config.defaultSettings?.tenantId);
				case 'paradym':
					return await ParadymApiService.instance.testConnection(
						apiKey,
						config.defaultSettings?.organizationId
					);
				default:
					return { success: false, message: `Test connection not implemented for ${providerId}` };
			}
		} catch (error) {
			return { success: false, message: `Connection test failed: ${(error as Error).message}` };
		}
	}

	private async testStudioConnection(
		apiKey: string,
		endpoint: string
	): Promise<{ success: boolean; message: string }> {
		try {
			const response = await fetch(`${endpoint}/account`, {
				headers: { 'x-api-key': apiKey },
			});
			return response.ok
				? { success: true, message: 'Studio connection successful' }
				: { success: false, message: `Studio API returned ${response.status}` };
		} catch (error) {
			return { success: false, message: `Studio connection failed: ${(error as Error).message}` };
		}
	}
}
