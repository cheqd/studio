import { ProviderService } from './provider.service.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import { ProviderConfigurationEntity } from '../../database/entities/provider-configuration.entity.js';
import {
	IProviderService,
	ProviderAccountResponse,
	ProviderApiKeyResponse,
	ConnectionTestResult,
	ProviderActivationResult,
} from '../../types/provider.types.js';

export abstract class BaseProviderService implements IProviderService {
	protected masterApiKey: string;

	constructor(envKeyName: string) {
		this.masterApiKey = process.env[envKeyName] || '';
		if (!this.masterApiKey && this.requiresMasterKey()) {
			throw new Error(`${envKeyName} environment variable is required`);
		}
	}

	// Abstract methods that must be implemented by each provider (internal use only)
	abstract getProviderId(): string;
	protected abstract createAccount(customerId: string, customerName?: string): Promise<ProviderAccountResponse>;
	protected abstract createApiKey(accountId: string, customerName?: string): Promise<ProviderApiKeyResponse>;
	protected abstract deleteAccount(accountId: string): Promise<void>;
	protected abstract testConnection(
		apiKey: string,
		accountId: string,
		config?: ProviderConfigurationEntity
	): Promise<ConnectionTestResult>;

	// Optional override - some providers might not need master keys
	protected requiresMasterKey(): boolean {
		return true;
	}

	// Common provider configuration management (consolidates duplicate logic)
	async activateProvider(customer: CustomerEntity): Promise<ProviderActivationResult> {
		const customerName = customer.name || customer.email || `Customer ${customer.customerId}`;

		// Step 1: Create account
		const account = await this.createAccount(customer.customerId, customerName);

		// Step 2: Create API key for that account
		const apiKeyResponse = await this.createApiKey(account.id, customerName);

		// Step 3: Return standardized result
		return {
			apiKey: apiKeyResponse.key,
			settings: {
				accountId: account.id,
				accountName: account.name,
				apiKeyId: apiKeyResponse.id,
				...this.getProviderSpecificSettings(account, apiKeyResponse),
			},
		};
	}

	async testProviderConfiguration(config: ProviderConfigurationEntity): Promise<ConnectionTestResult> {
		const apiKey = await ProviderService.instance.getDecryptedApiKey(config);
		const accountId = this.extractAccountId(config);
		return this.testConnection(apiKey, accountId, config);
	}

	async cleanupProviderResources(config: ProviderConfigurationEntity): Promise<void> {
		const accountId = this.extractAccountId(config);
		if (accountId) {
			await this.deleteAccount(accountId);
		}
	}

	// Helper method to get provider URL
	protected async getBaseUrl(): Promise<string> {
		const provider = await ProviderService.instance.getProvider(this.getProviderId());
		return provider?.apiUrl || this.getDefaultApiUrl();
	}

	// Helper method to get base URL with configuration-specific endpoint support
	protected getBaseUrlFromConfig(config?: ProviderConfigurationEntity): string {
		if (config?.apiEndpoint) {
			return config.apiEndpoint;
		}
		// Fallback to provider default - note: this is async, so providers should override if they need this
		return this.getDefaultApiUrl();
	}

	// Provider-specific implementations can override these
	protected abstract getDefaultApiUrl(): string;
	protected abstract extractAccountId(config: ProviderConfigurationEntity): string;
	protected getProviderSpecificSettings(
		account: ProviderAccountResponse,
		apiKey: ProviderApiKeyResponse
	): Record<string, any> {
		return {};
	}
}
