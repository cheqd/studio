import { ProviderService } from '../../services/api/providers/provider.service.js';
export async function seedProviders() {
	const providerService = ProviderService.instance;

	const defaultProviders = [
		{
			providerId: 'studio',
			name: 'cheqd Studio',
			description: 'Native cheqd credential issuance using Studio API',
			providerType: 'credential-all',
			supportedFormats: ['jsonld', 'jwt'],
			supportedProtocols: ['direct'],
			metadata: {
				capabilities: ['issue', 'revoke', 'suspend', 'reinstate', 'verify'],
				logoUrl: '/cheqd-logo-favicon.png',
				documentationUrl: 'https://docs.cheqd.io',
				apiUrl: process.env.APPLICATION_BASE_URL || 'http://localhost:3000',
			},
		},
		{
			providerId: 'creds',
			name: 'creds xyz',
			description: 'Credential issuance using Creds API',
			providerType: 'credential-all',
			supportedFormats: ['jsonld', 'jwt'],
			supportedProtocols: ['direct'],
			metadata: {
				capabilities: ['issue', 'revoke', 'suspend', 'reinstate', 'verify'],
				logoUrl: '/creds-logo.png',
				documentationUrl: 'https://studio.creds.xyz',
				apiUrl: 'https://api.creds.xyz',
			},
		},
		{
			providerId: 'dock',
			name: 'Dock Truvera',
			description: 'Dock Labs Truvera credential issuance platform',
			providerType: 'credential-all',
			supportedFormats: ['jsonld', 'sd-jwt-vc'],
			supportedProtocols: ['direct', 'openid4vc'],
			metadata: {
				capabilities: ['issue', 'revoke', 'verify', 'batch-issue'],
				logoUrl: '/dock-logo.png',
				documentationUrl: 'https://docs.truvera.io/truvera-api',
				apiUrl: 'https://api-testnet.truvera.io',
			},
		},
		{
			providerId: 'hovi',
			name: 'HOVI',
			description: 'HOVI credential issuance and verification platform',
			providerType: 'credential-all',
			supportedFormats: ['jsonld', 'jwt', 'sd-jwt-vc'],
			supportedProtocols: ['direct', 'didcomm', 'openid4vc'],
			metadata: {
				capabilities: ['issue', 'revoke', 'suspend', 'reinstate', 'verify', 'batch-issue'],
				logoUrl: '/hovi-logo.png',
				documentationUrl: 'https://docs.hovi.id',
				apiUrl: 'https://api.hovi.id',
			},
		},
		{
			providerId: 'paradym',
			name: 'Paradym',
			description: 'Animo Paradym credential management platform',
			providerType: 'credential-all',
			supportedFormats: ['jsonld', 'anoncreds'],
			supportedProtocols: ['didcomm', 'openid4vc'],
			metadata: {
				capabilities: ['issue', 'revoke', 'verify', 'connection-management'],
				logoUrl: '/paradym-logo.png',
				documentationUrl: 'https://docs.paradym.id/api-and-dashboard',
				apiUrl: 'https://api.paradym.id',
			},
		},
	];

	for (const providerData of defaultProviders) {
		try {
			const existing = await providerService.getProvider(providerData.providerId);
			if (!existing) {
				await providerService.createProvider(providerData);
				console.log(`✅ Seeded provider: ${providerData.name}`);
			}
		} catch (error) {
			console.error(`❌ Failed to seed provider ${providerData.name}:`, error);
		}
	}
}
