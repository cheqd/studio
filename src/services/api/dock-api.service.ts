import * as dotenv from 'dotenv';
import { ProviderService } from './provider.service.js';

dotenv.config();

interface DockSubaccountResponse {
	id: string;
	name: string;
	parentId: string;
	createdAt: string;
}

interface DockApiKeyResponse {
	id: string;
	token: string;
}

export class DockApiService {
	private masterApiKey: string;

	public static instance = new DockApiService();

	constructor() {
		this.masterApiKey = process.env.DOCK_MASTER_API_KEY || '';

		if (!this.masterApiKey) {
			throw new Error('DOCK_MASTER_API_KEY environment variable is required');
		}
	}

	private async getBaseUrl(): Promise<string> {
		const provider = await ProviderService.instance.getProvider('dock');
		return provider?.apiUrl || 'https://api-testnet.truvera.io';
	}

	async createSubaccount(customerId: string): Promise<DockSubaccountResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/subaccounts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({
				name: `${customerId}`,
				image: `Subaccount for cheqd-studio ${customerId}`,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create Dock subaccount: ${response.status} ${error}`);
		}

		return await response.json();
	}

	async createApiKeyForSubaccount(subaccountId: string): Promise<DockApiKeyResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/subaccounts/${subaccountId}/keys`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.masterApiKey}`,
			},
			body: JSON.stringify({}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create Dock API key: ${response.status} ${error}`);
		}

		return await response.json();
	}

	async deleteSubaccount(subaccountId: string): Promise<void> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/subaccounts/${subaccountId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${this.masterApiKey}`,
			},
		});

		if (!response.ok && response.status !== 404) {
			const error = await response.text();
			throw new Error(`Failed to delete Dock subaccount: ${response.status} ${error}`);
		}
	}

	async testConnection(apiKey: string, subaccountId: string): Promise<{ success: boolean; message: string }> {
		try {
			const baseUrl = await this.getBaseUrl();
			const response = await fetch(`${baseUrl}/subaccounts`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			});
			return response.ok
				? { success: true, message: 'Dock connection successful' }
				: { success: false, message: `Dock API returned ${response.status}` };
		} catch (error) {
			return { success: false, message: `Dock connection failed: ${(error as Error).message}` };
		}
	}
}
