// src/types/provider.types.ts
export interface ProviderConfiguration {
	configId?: string;
	providerId: string;
	apiKey: string;
	apiEndpoint: string;
	webhookUrl?: string;
	capabilities?: string[];
	defaultSettings?: any;
	validated?: boolean;
	active?: boolean;
}

export interface ProviderInfo {
	providerId: string;
	name: string;
	description?: string;
	providerType: ProviderType;
	supportedFormats: CredentialFormat[];
	supportedProtocols: IssuanceProtocol[];
	capabilities: ProviderCapability[];
	logoUrl?: string;
	documentationUrl?: string;
	enabled: boolean;
}

export enum ProviderType {
	STUDIO = 'studio',
	DOCK = 'dock',
	HOVI = 'hovi',
	PARADYM = 'paradym',
}

export enum CredentialFormat {
	JSON_LD = 'json-ld',
	JWT_VC = 'jwt-vc',
	SD_JWT_VC = 'sd-jwt-vc',
	ANONCREDS = 'anoncreds',
}

export enum IssuanceProtocol {
	DIRECT = 'direct',
	DIDCOMM = 'didcomm',
	OPENID4VC = 'openid4vc',
}

export enum ProviderCapability {
	ISSUE = 'issue',
	REVOKE = 'revoke',
	SUSPEND = 'suspend',
	REINSTATE = 'reinstate',
	VERIFY = 'verify',
	BATCH_ISSUE = 'batch-issue',
	CONNECTION_MANAGEMENT = 'connection-management',
	TEMPLATE_MANAGEMENT = 'template-management',
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	responseTime?: number;
	capabilities?: string[];
}

export interface ConfiguredProvider {
	configId: string;
	providerId: string;
	providerName: string;
	providerType: ProviderType;
	apiEndpoint: string;
	webhookUrl?: string;
	validated: boolean;
	validatedAt?: Date;
	active: boolean;
	capabilities: string[];
	defaultSettings?: any;
	createdAt: Date;
	updatedAt?: Date;
	lastHealthCheck?: Date;
}
