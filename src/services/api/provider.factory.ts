import { IProviderService } from '../../types/provider.types';

// Provider registry - lazy loading to avoid circular imports
const providerRegistry = new Map<string, () => Promise<IProviderService>>();

export class ProviderFactory {
	// Register providers - called by each provider service
	static registerProvider(providerId: string, factory: () => Promise<IProviderService>): void {
		providerRegistry.set(providerId, factory);
	}

	static async getProviderService(providerId: string): Promise<IProviderService> {
		const factory = providerRegistry.get(providerId);
		if (!factory) {
			throw new Error(`Unsupported provider: ${providerId}`);
		}
		return await factory();
	}

	static getRegisteredProviders(): string[] {
		return Array.from(providerRegistry.keys());
	}

	static isProviderSupported(providerId: string): boolean {
		return providerRegistry.has(providerId);
	}
}

export async function initializeProviders(): Promise<void> {
	// Register all providers with lazy loading
	ProviderFactory.registerProvider('dock', async () => {
		const { DockApiService } = await import('./providers/dock-api.service.js');
		return DockApiService.instance;
	});

	ProviderFactory.registerProvider('hovi', async () => {
		const { HoviApiService } = await import('./providers/hovi-api.service.js');
		return HoviApiService.instance;
	});

	ProviderFactory.registerProvider('paradym', async () => {
		const { ParadymApiService } = await import('./providers/paradym-api.service.js');
		return ParadymApiService.instance;
	});

	ProviderFactory.registerProvider('studio', async () => {
		const { StudioApiService } = await import('./providers/studio-api.service.js');
		return StudioApiService.instance;
	});
}
