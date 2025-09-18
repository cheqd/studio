import * as dotenv from 'dotenv';
import { BaseProviderService } from './base-provider.service.js';
import {
	ProviderAccountResponse,
	ProviderApiKeyResponse,
	ConnectionTestResult,
} from '../../../types/provider.types.js';
import { CustomerEntity } from '../../../database/entities/customer.entity.js';
import { ProviderConfigurationEntity } from '../../../database/entities/provider-configuration.entity.js';
import { APIServiceOptions } from '../../../types/admin.js';
import { APIKeyService } from '../../admin/api-key.js';
import { UserEntity } from '../../../database/entities/user.entity.js';
import { Connection } from '../../../database/connection/connection.js';

dotenv.config();

export class StudioApiService extends BaseProviderService {
	public static instance = new StudioApiService();

	constructor() {
		super('STUDIO_MASTER_API_KEY'); // This is optional, studio might not need master key
	}

	protected requiresMasterKey(): boolean {
		return false; // Studio doesn't require a master API key
	}

	getProviderId(): string {
		return 'studio';
	}

	protected getDefaultApiUrl(): string {
		return process.env.APPLICATION_BASE_URL || 'http://localhost:3000';
	}

	protected extractAccountId(config: ProviderConfigurationEntity): string {
		return config.customer.customerId;
	}

	protected async createAccount(customerId: string, customerName?: string): Promise<ProviderAccountResponse> {
		return {
			id: customerId,
			name: customerName || `Customer ${customerId}`,
			description: `Studio account for customer ${customerId}`,
		};
	}

	protected async createApiKey(accountId: string): Promise<ProviderApiKeyResponse> {
		const customerRepository = Connection.instance.dbConnection.getRepository(CustomerEntity);
		const customer = await customerRepository.findOne({
			where: { customerId: accountId },
		});

		if (!customer) {
			throw new Error(`Customer ${accountId} not found`);
		}

		const apiKey = await this.getOrCreateStudioApiKey(customer);
		return {
			id: accountId,
			key: apiKey,
		};
	}

	protected async deleteAccount(accountId: string): Promise<void> {
		// For studio, we don't actually delete the account
		// Just revoke associated API keys
		console.log(`Studio account cleanup for ${accountId} - revoking API keys`);
	}

	protected async testConnection(
		apiKey: string,
		accountId: string,
		config?: ProviderConfigurationEntity
	): Promise<ConnectionTestResult> {
		try {
			const baseUrl = config ? this.getBaseUrlFromConfig(config) : await this.getBaseUrl();
			const response = await fetch(`${baseUrl}/account`, {
				headers: { 'x-api-key': apiKey },
			});
			return response.ok
				? { success: true, message: 'Studio connection successful' }
				: { success: false, message: `Studio API returned ${response.status}` };
		} catch (error) {
			return { success: false, message: `Studio connection failed: ${(error as Error).message}` };
		}
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
}
