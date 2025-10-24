import { MigrationInterface, QueryRunner } from 'typeorm';
import { IssuedCredentialEntity } from '../entities/issued-credential.entity.js';
import { CredentialProviderEntity } from '../entities/credential-provider.entity.js';
import { ProviderConfigurationEntity } from '../entities/provider-configuration.entity.js';
import type { DockListCredentialResponse } from '../../services/identity/providers/dock/types.js';
import { SecretBox } from '@veramo/kms-local';

/**
 * Migrates existing Dock credentials from Dock API to IssuedCredentialEntity
 * This migration:
 * 1. Finds all customers with active Dock provider configuration
 * 2. Fetches credentials from Dock API for each customer
 * 3. Creates corresponding IssuedCredentialEntity records
 */
export class MigrateDockCredentials1760533089589 implements MigrationInterface {
	private readonly DOCK_API_URL = 'https://api-testnet.truvera.io';
	private secretBox!: SecretBox;

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('Starting Dock credentials migration...');
		this.secretBox = new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY);

		// Get Dock provider
		const dockProvider = await queryRunner.manager.findOne(CredentialProviderEntity, {
			where: { providerId: 'dock' },
		});

		if (!dockProvider) {
			console.log('Dock provider not found, skipping credential migration');
			return;
		}

		console.log(`Found Dock provider: ${dockProvider.providerId}`);

		// Find all customers with Dock provider configuration
		const dockConfigurations = await queryRunner.manager.find(ProviderConfigurationEntity, {
			where: { providerId: dockProvider.providerId, active: true },
			relations: ['customer'],
		});

		console.log(`Found ${dockConfigurations.length} customers with active Dock configuration`);

		if (dockConfigurations.length === 0) {
			console.log('No active Dock configurations to migrate');
			return;
		}

		let totalSuccess = 0;
		let totalSkipped = 0;
		let totalErrors = 0;
		const customerErrors: Array<{ customerId: string; error: string }> = [];

		// Process each customer's credentials
		for (const config of dockConfigurations) {
			try {
				console.log(`\nProcessing customer: ${config.customer.customerId}...`);

				// Decrypt API key manually to avoid circular dependency
				const apiKey = await this.decryptApiKey(config.encryptedApiKey);

				if (!apiKey) {
					throw new Error('Failed to decrypt API key');
				}

				// Fetch credentials from Dock API
				const credentials = await this.fetchDockCredentials(apiKey);

				console.log(`  Found ${credentials.length} credentials for customer ${config.customer.customerId}`);

				let successCount = 0;
				let skippedCount = 0;
				let errorCount = 0;

				for (const credential of credentials) {
					try {
						// Check if already migrated using Dock's credential ID
						const existing = await queryRunner.manager.findOne(IssuedCredentialEntity, {
							where: {
								providerId: dockProvider.providerId,
								providerCredentialId: credential.id,
							},
						});

						if (existing) {
							skippedCount++;
							continue;
						}

						// Determine status
						const status = credential.revoked ? 'revoked' : 'issued';

						// Parse dates
						const issuedAt = new Date(credential.createdAt);
						const expiresAt = credential.expirationDate ? new Date(credential.expirationDate) : undefined;

						// Handle credential type - default to 'VerifiableCredential' if empty
						const credentialType =
							credential.type && credential.type.trim() !== '' ? credential.type : 'VerifiableCredential';

						let category: 'credential' | 'accreditation' = 'credential';
						if (credentialType.includes('Accreditation') || credentialType.includes('accreditation')) {
							category = 'accreditation';
						}

						// Create IssuedCredentialEntity (using object initialization to avoid constructor issues)
						const issuedCredential = queryRunner.manager.create(IssuedCredentialEntity, {
							providerId: dockProvider.providerId,
							format: 'jsonld', // Dock credentials are JSON-LD format
							category: category,
							type: [credentialType],
							issuedAt: issuedAt,
							customer: config.customer,
							providerCredentialId: credential.id,
							issuerId: credential.issuerKey.split('#')[0], // Extract DID from key reference
							subjectId: credential.subjectRef,
							status: status as 'issued' | 'revoked',
							statusUpdatedAt: credential.revoked ? issuedAt : undefined,
							credentialStatus: credential.revocationRegistry
								? {
										id: credential.revocationRegistry,
										index: credential.index,
									}
								: undefined,
							expiresAt: expiresAt,
							metadata: {
								migratedFrom: 'DockAPI',
								dockCredentialId: credential.id,
								issuerKey: credential.issuerKey,
							},
						});

						await queryRunner.manager.save(IssuedCredentialEntity, issuedCredential);
						successCount++;

						if (successCount % 10 === 0) {
							console.log(`    Migrated ${successCount} credentials so far...`);
						}
					} catch (error) {
						errorCount++;
						console.error(
							`    Error migrating credential ${credential.id}:`,
							error instanceof Error ? error.message : String(error)
						);
						// Continue with next credential
					}
				}

				console.log(`  Customer ${config.customer.customerId} completed:`);
				console.log(`    Successfully migrated: ${successCount}`);
				console.log(`    Skipped (already migrated): ${skippedCount}`);
				console.log(`    Errors: ${errorCount}`);

				totalSuccess += successCount;
				totalSkipped += skippedCount;
				totalErrors += errorCount;

				// Small delay between customers to avoid rate limiting
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				customerErrors.push({
					customerId: config.customer.customerId,
					error: errorMessage,
				});
				console.error(`  Error processing customer ${config.customer.customerId}:`, errorMessage);
				// Continue with next customer
			}
		}

		console.log(`\nMigration completed:`);
		console.log(`  Total successfully migrated: ${totalSuccess}`);
		console.log(`  Total skipped (already migrated): ${totalSkipped}`);
		console.log(`  Total errors: ${totalErrors}`);
		console.log(
			`  Customers processed: ${dockConfigurations.length - customerErrors.length}/${dockConfigurations.length}`
		);

		if (customerErrors.length > 0) {
			console.log(`\nCustomer errors:`);
			customerErrors.forEach(({ customerId, error }) => {
				console.log(`  - ${customerId}: ${error}`);
			});
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('Rolling back Dock credentials migration...');

		// Get Dock provider
		const dockProvider = await queryRunner.manager.findOne(CredentialProviderEntity, {
			where: { providerId: 'dock' },
		});

		if (!dockProvider) {
			console.log('Dock provider not found, nothing to rollback');
			return;
		}

		// Delete all IssuedCredentialEntity records that were migrated from Dock API
		const result = await queryRunner.manager
			.createQueryBuilder()
			.delete()
			.from(IssuedCredentialEntity)
			.where('providerId = :providerId', { providerId: dockProvider.providerId })
			.andWhere("metadata->>'migratedFrom' = :migratedFrom", { migratedFrom: 'DockAPI' })
			.execute();

		console.log(`Rolled back ${result.affected} migrated credentials`);
	}

	/**
	 * Fetch credentials from Dock API for a customer
	 */
	private async fetchDockCredentials(apiKey: string): Promise<DockListCredentialResponse> {
		try {
			const response = await fetch(`${this.DOCK_API_URL}/credentials`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as DockListCredentialResponse;

			// Validate response
			if (!Array.isArray(data)) {
				throw new Error('Invalid response from Dock API: expected array');
			}

			return data;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to fetch credentials from Dock API: ${errorMessage}`);
		}
	}

	/**
	 * Decrypt API key manually to avoid circular dependency with ProviderService
	 * This replicates the decryption logic from ProviderService
	 */
	private async decryptApiKey(encryptedApiKey: string): Promise<string> {
		return await this.secretBox.decrypt(encryptedApiKey);
	}
}
