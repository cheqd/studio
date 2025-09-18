import * as dotenv from 'dotenv';
import { BaseProviderService } from './base-provider.service.js';
import {
	ConnectionTestResult,
	ProviderAccountResponse,
	ProviderApiKeyResponse,
} from '../../../types/provider.types.js';
import { ProviderConfigurationEntity } from '../../../database/entities/provider-configuration.entity.js';

dotenv.config();

interface HoviApiKeyResponse {
	id: string;
	key: string;
	name: string;
	permissions: string[];
	createdAt: string;
}

export class HoviApiService extends BaseProviderService {
	public static instance = new HoviApiService();

	constructor() {
		super('HOVI_MASTER_API_KEY');
	}

	getProviderId(): string {
		return 'hovi';
	}

	protected getDefaultApiUrl(): string {
		return 'https://api.hovi.id';
	}

	protected extractAccountId(config: ProviderConfigurationEntity): string {
		return config.defaultSettings?.tenantId || '';
	}

	protected getProviderSpecificSettings(
		account: ProviderAccountResponse,
		apiKey: ProviderApiKeyResponse
	): Record<string, any> {
		return {
			tenantId: account.id,
			tenantName: account.name,
			hoviApiKeyId: apiKey.id,
		};
	}

	protected async createAccount(customerId: string, customerName?: string): Promise<ProviderAccountResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/tenants`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: customerName || `Customer ${customerId}`,
				description: `Tenant for customer ${customerId}`,
				customerId: customerId,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create HOVI tenant: ${response.status} ${error}`);
		}

		return await response.json();
	}

	protected async createApiKey(accountId: string, customerName?: string): Promise<ProviderApiKeyResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/tenants/${accountId}/keys`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: `API Key for ${customerName || 'Customer'}`,
				permissions: ['read', 'write'],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create HOVI API key: ${response.status} ${error}`);
		}

		const hoviResponse: HoviApiKeyResponse = await response.json();
		return {
			id: hoviResponse.id,
			key: hoviResponse.key,
			name: hoviResponse.name,
			permissions: hoviResponse.permissions,
			createdAt: hoviResponse.createdAt,
		};
	}

	protected async deleteAccount(accountId: string): Promise<void> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/tenants/${accountId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${this.masterApiKey}`,
			},
		});

		if (!response.ok && response.status !== 404) {
			const error = await response.text();
			throw new Error(`Failed to delete HOVI tenant: ${response.status} ${error}`);
		}
	}

	protected async testConnection(
		apiKey: string,
		accountId: string,
		config?: ProviderConfigurationEntity
	): Promise<ConnectionTestResult> {
		try {
			const baseUrl = config ? this.getBaseUrlFromConfig(config) : await this.getBaseUrl();
			const response = await fetch(`${baseUrl}/tenants/${accountId}`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			});
			return response.ok
				? { success: true, message: 'HOVI connection successful' }
				: { success: false, message: `HOVI API returned ${response.status}` };
		} catch (error) {
			return { success: false, message: `HOVI connection failed: ${(error as Error).message}` };
		}
	}
}
