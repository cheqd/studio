import * as dotenv from 'dotenv';
import { BaseProviderService } from './base-provider.service.js';
import { ConnectionTestResult, ProviderAccountResponse, ProviderApiKeyResponse } from '../../types/provider.types.js';
import { ProviderConfigurationEntity } from '../../database/entities/provider-configuration.entity.js';

dotenv.config();

interface ParadymApiKeyResponse {
	id: string;
	key: string;
	name: string;
	scopes: string[];
	createdAt: string;
}

export class ParadymApiService extends BaseProviderService {
	public static instance = new ParadymApiService();

	constructor() {
		super('PARADYM_MASTER_API_KEY');
	}

	getProviderId(): string {
		return 'paradym';
	}

	protected getDefaultApiUrl(): string {
		return 'https://api.paradym.id';
	}

	protected extractAccountId(config: ProviderConfigurationEntity): string {
		return config.defaultSettings?.organizationId || '';
	}

	protected getProviderSpecificSettings(
		account: ProviderAccountResponse,
		apiKey: ProviderApiKeyResponse
	): Record<string, any> {
		return {
			organizationId: account.id,
			organizationName: account.name,
			paradymApiKeyId: apiKey.id,
		};
	}

	protected async createAccount(customerId: string, customerName?: string): Promise<ProviderAccountResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/organizations`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: customerName || `Customer ${customerId}`,
				description: `Organization for customer ${customerId}`,
				customerId: customerId,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create Paradym organization: ${response.status} ${error}`);
		}

		return await response.json();
	}

	protected async createApiKey(accountId: string, customerName?: string): Promise<ProviderApiKeyResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/organizations/${accountId}/api-keys`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: `API Key for ${customerName || 'Customer'}`,
				scopes: ['credentials:read', 'credentials:write', 'connections:read'],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create Paradym API key: ${response.status} ${error}`);
		}

		const paradymResponse: ParadymApiKeyResponse = await response.json();
		return {
			id: paradymResponse.id,
			key: paradymResponse.key,
			name: paradymResponse.name,
			scopes: paradymResponse.scopes,
			createdAt: paradymResponse.createdAt,
		};
	}

	protected async deleteAccount(accountId: string): Promise<void> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/organizations/${accountId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${this.masterApiKey}`,
			},
		});

		if (!response.ok && response.status !== 404) {
			const error = await response.text();
			throw new Error(`Failed to delete Paradym organization: ${response.status} ${error}`);
		}
	}

	protected async testConnection(
		apiKey: string,
		accountId: string,
		config?: ProviderConfigurationEntity
	): Promise<ConnectionTestResult> {
		try {
			const baseUrl = config ? this.getBaseUrlFromConfig(config) : await this.getBaseUrl();
			const response = await fetch(`${baseUrl}/organizations/${accountId}`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			});
			return response.ok
				? { success: true, message: 'Paradym connection successful' }
				: { success: false, message: `Paradym API returned ${response.status}` };
		} catch (error) {
			return { success: false, message: `Paradym connection failed: ${(error as Error).message}` };
		}
	}
}
