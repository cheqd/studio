import * as dotenv from 'dotenv';
import { BaseProviderService } from './base-provider.service.js';
import {
	ConnectionTestResult,
	ProviderAccountResponse,
	ProviderApiKeyResponse,
} from '../../../types/provider.types.js';
import { ProviderConfigurationEntity } from '../../../database/entities/provider-configuration.entity.js';
import { DockIdentityService } from '../../identity/providers/dock/identity.js';

dotenv.config();

interface DockApiKeyResponse {
	id: string;
	token: string;
}

export class DockApiService extends BaseProviderService {
	public static instance = new DockApiService();
	public identityService = new DockIdentityService();

	constructor() {
		super('DOCK_MASTER_API_KEY');
	}

	getProviderId(): string {
		return 'dock';
	}

	protected getDefaultApiUrl(): string {
		return 'https://api-testnet.truvera.io';
	}

	protected extractAccountId(config: ProviderConfigurationEntity): string {
		return config.defaultSettings?.subaccountId || '';
	}

	protected getProviderSpecificSettings(
		account: ProviderAccountResponse,
		apiKey: ProviderApiKeyResponse
	): Record<string, any> {
		return {
			subaccountId: account.id,
			subaccountName: account.name,
			dockApiKeyId: apiKey.id,
			parentId: (account as any).parentId,
		};
	}

	protected async createAccount(customerId: string): Promise<ProviderAccountResponse> {
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

	protected async createApiKey(accountId: string): Promise<ProviderApiKeyResponse> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/subaccounts/${accountId}/keys`, {
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

		const dockResponse: DockApiKeyResponse = await response.json();
		return {
			id: dockResponse.id,
			key: dockResponse.token,
		};
	}

	protected async deleteAccount(accountId: string): Promise<void> {
		const baseUrl = await this.getBaseUrl();
		const response = await fetch(`${baseUrl}/subaccounts/${accountId}`, {
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

	protected async testConnection(
		apiKey: string,
		accountId: string,
		config?: ProviderConfigurationEntity
	): Promise<ConnectionTestResult> {
		try {
			const baseUrl = config ? this.getBaseUrlFromConfig(config) : await this.getBaseUrl();
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
