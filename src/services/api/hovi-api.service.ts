import * as dotenv from 'dotenv';
import { ProviderService } from './provider.service.js';

dotenv.config();

interface HoviTenantResponse {
	id: string;
	name: string;
	description: string;
	createdAt: string;
}

interface HoviApiKeyResponse {
	id: string;
	key: string;
	name: string;
	permissions: string[];
	createdAt: string;
}

export class HoviApiService {
	private masterApiKey: string;

	public static instance = new HoviApiService();

	constructor() {
		this.masterApiKey = process.env.HOVI_MASTER_API_KEY || '';

		if (!this.masterApiKey) {
			throw new Error('HOVI_MASTER_API_KEY environment variable is required');
		}
	}

	private async getBaseUrl(): Promise<string> {
		const provider = await ProviderService.instance.getProvider('hovi');
		return provider?.apiUrl || 'https://api.hovi.id';
	}

	async createTenant(customerId: string, customerName: string): Promise<HoviTenantResponse> {
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

	async createApiKeyForTenant(tenantId: string, customerName: string): Promise<HoviApiKeyResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/tenants/${tenantId}/keys`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: `API Key for ${customerName}`,
				permissions: ['read', 'write'],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create HOVI API key: ${response.status} ${error}`);
		}

		return await response.json();
	}

	async deleteTenant(tenantId: string): Promise<void> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/tenants/${tenantId}`, {
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

	async testConnection(apiKey: string, tenantId: string): Promise<{ success: boolean; message: string }> {
		try {
			const baseUrl = await this.getBaseUrl();
			const response = await fetch(`${baseUrl}/tenants/${tenantId}`, {
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
