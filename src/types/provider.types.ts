import { CustomerEntity } from '../database/entities/customer.entity.js';
import { ProviderConfigurationEntity } from '../database/entities/provider-configuration.entity.js';

export interface ProviderAccountResponse {
	id: string;
	name: string;
	[key: string]: any; // Allow for provider-specific fields
}

export interface ProviderApiKeyResponse {
	id: string;
	key: string;
	name?: string;
	permissions?: string[];
	scopes?: string[];
	[key: string]: any; // Allow for provider-specific fields
}

export interface ConnectionTestResult {
	success: boolean;
	message: string;
}

export interface ProviderActivationResult {
	apiKey: string;
	settings: any;
}

// Clean interface - only exposes high-level operations
export interface IProviderService {
	// Core provider identity
	getProviderId(): string;

	// High-level provider operations (what consumers actually need)
	activateProvider(customer: CustomerEntity): Promise<ProviderActivationResult>;
	testProviderConfiguration(config: ProviderConfigurationEntity): Promise<ConnectionTestResult>;
	cleanupProviderResources(config: ProviderConfigurationEntity): Promise<void>;
}
