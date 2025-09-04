import * as dotenv from 'dotenv';
import { ProviderService } from './provider.service.js';

dotenv.config();

interface ParadymOrganizationResponse {
	id: string;
	name: string;
	description: string;
	createdAt: string;
}

interface ParadymApiKeyResponse {
	id: string;
	key: string;
	name: string;
	scopes: string[];
	createdAt: string;
}

export class ParadymApiService {
	private masterApiKey: string;

	public static instance = new ParadymApiService();

	constructor() {
		this.masterApiKey = process.env.PARADYM_MASTER_API_KEY || '';

		if (!this.masterApiKey) {
			throw new Error('PARADYM_MASTER_API_KEY environment variable is required');
		}
	}

	private async getBaseUrl(): Promise<string> {
		const provider = await ProviderService.instance.getProvider('paradym');
		return provider?.apiUrl || 'https://api.paradym.id';
	}

	async createOrganization(customerId: string, customerName: string): Promise<ParadymOrganizationResponse> {
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

	async createApiKeyForOrganization(organizationId: string, customerName: string): Promise<ParadymApiKeyResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/organizations/${organizationId}/api-keys`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: `API Key for ${customerName}`,
				scopes: ['credentials:read', 'credentials:write', 'connections:read'],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create Paradym API key: ${response.status} ${error}`);
		}

		return await response.json();
	}

	async deleteOrganization(organizationId: string): Promise<void> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/organizations/${organizationId}`, {
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

	async testConnection(apiKey: string, organizationId: string): Promise<{ success: boolean; message: string }> {
		try {
			const baseUrl = await this.getBaseUrl();
			const response = await fetch(`${baseUrl}/organizations/${organizationId}`, {
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
