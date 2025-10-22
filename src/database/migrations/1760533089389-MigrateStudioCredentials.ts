import { MigrationInterface, QueryRunner } from 'typeorm';
import { ResourceEntity } from '../entities/resource.entity.js';
import { IssuedCredentialEntity } from '../entities/issued-credential.entity.js';
import { CredentialProviderEntity } from '../entities/credential-provider.entity.js';
import { type VerifiableCredential } from '@veramo/core';

/**
 * Migrates existing Studio (Veramo) credentials from ResourceEntity to IssuedCredentialEntity
 * This migration:
 * 1. Finds all ResourceEntity records with resourceType='VerifiableCredential', 'VerifiableAccreditationToAccredit', or 'VerifiableAccreditationToAttest'
 * 2. Resolves credential data from DID URLs via resolver
 * 3. Creates corresponding IssuedCredentialEntity records with providerId='studio'
 */
export class MigrateStudioCredentials1760533089389 implements MigrationInterface {
	private readonly JWT_PROOF_TYPE = 'JwtProof2020';
	private readonly RESOLVER_URL = process.env.RESOLVER_URL || 'https://resolver.cheqd.net';
	private readonly BATCH_SIZE = 50; // Process credentials in batches to avoid memory issues

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('Starting Studio credentials migration...');

		// Get Studio provider
		const studioProvider = await queryRunner.manager.findOne(CredentialProviderEntity, {
			where: { providerId: 'studio' },
		});

		if (!studioProvider) {
			console.log('Studio provider not found, skipping credential migration');
			return;
		}

		console.log(`Found Studio provider: ${studioProvider.providerId}`);

		// Find all credential resources
		const credentialResources = await queryRunner.manager.find(ResourceEntity, {
			where: [
				{ resourceType: 'VerifiableCredential' },
				{ resourceType: 'VerifiableAccreditationToAccredit' },
				{ resourceType: 'VerifiableAccreditationToAttest' },
				{ resourceType: 'VerifiableAuthorizationForTrustChain' },
			],
			relations: ['identifier', 'customer'],
		});

		console.log(`Found ${credentialResources.length} credential resources to migrate`);

		if (credentialResources.length === 0) {
			console.log('No credentials to migrate');
			return;
		}

		let successCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		const errors: Array<{ resourceId: string; error: string }> = [];

		// Process credentials in batches
		for (let i = 0; i < credentialResources.length; i += this.BATCH_SIZE) {
			const batch = credentialResources.slice(i, i + this.BATCH_SIZE);

			for (const resource of batch) {
				try {
					// Check if already migrated
					const existing = await queryRunner.manager.findOne(IssuedCredentialEntity, {
						where: {
							providerId: studioProvider.providerId,
							providerCredentialId: resource.resourceId,
						},
					});

					if (existing) {
						skippedCount++;
						continue;
					}

					// Resolve credential from DID URL
					const didUrl = `${resource.identifier.did}/resources/${resource.resourceId}`;
					const credential = await this.resolveCredential(didUrl);

					if (!credential) {
						throw new Error(`Failed to resolve credential from ${didUrl}`);
					}

					// Determine format based on proof type
					let format: 'jwt' | 'jsonld' = 'jsonld';
					if (credential.proof) {
						if (typeof credential.proof === 'object' && 'type' in credential.proof) {
							format = credential.proof.type === this.JWT_PROOF_TYPE ? 'jwt' : 'jsonld';
						}
					}

					// Extract credential type
					const type = Array.isArray(credential.type)
						? credential.type
						: typeof credential.type === 'string'
							? [credential.type]
							: ['VerifiableCredential'];

					// Extract issuer DID
					const issuerId = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer?.id;

					// Extract subject DID
					const subjectId = credential.credentialSubject?.id;

					// Parse dates
					const issuedAt = credential.issuanceDate ? new Date(credential.issuanceDate) : resource.createdAt;
					const expiresAt = credential.expirationDate ? new Date(credential.expirationDate) : undefined;

					// Create IssuedCredentialEntity
					const issuedCredential = queryRunner.manager.create(IssuedCredentialEntity, {
						providerId: studioProvider.providerId,
						format: format,
						type: type,
						issuedAt: issuedAt,
						customer: resource.customer,
						providerCredentialId: resource.resourceId,
						issuerId: issuerId,
						subjectId: subjectId,
						status: 'issued',
						credentialStatus: credential.credentialStatus,
						expiresAt: expiresAt,
						metadata: {
							migratedFrom: 'ResourceEntity',
							schema: credential.credentialSchema,
							proof: credential.proof,
							resourceType: resource.resourceType,
							didUrl: didUrl,
							encrypted: resource.encrypted,
							termsOfUse: credential.termsOfUse,
						},
					});

					await queryRunner.manager.save(IssuedCredentialEntity, issuedCredential);
					successCount++;

					if (successCount % 10 === 0) {
						console.log(`    Migrated ${successCount} credentials so far...`);
					}
				} catch (error) {
					errorCount++;
					const errorMessage = error instanceof Error ? error.message : String(error);
					errors.push({
						resourceId: resource.resourceId,
						error: errorMessage,
					});
					console.error(`    Error migrating credential ${resource.resourceId}:`, errorMessage);
					// Continue with next credential
				}
			}

			// Small delay between batches
			if (i + this.BATCH_SIZE < credentialResources.length) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}

		console.log(`\nMigration completed:`);
		console.log(`  Successfully migrated: ${successCount}`);
		console.log(`  Skipped (already migrated): ${skippedCount}`);
		console.log(`  Errors: ${errorCount}\n`);
		console.log(`  Total processed: ${successCount + skippedCount + errorCount}/${credentialResources.length}`);
		if (errors.length > 0) {
			console.log(`\nErrors encountered (first 10):`);
			errors.slice(0, 10).forEach(({ resourceId, error }) => {
				console.log(`  - ${resourceId}: ${error}`);
			});
			if (errors.length > 10) {
				console.log(`  ... and ${errors.length - 10} more errors`);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('Rolling back Studio credentials migration...');

		// Get Studio provider
		const studioProvider = await queryRunner.manager.findOne(CredentialProviderEntity, {
			where: { providerId: 'studio' },
		});

		if (!studioProvider) {
			console.log('Studio provider not found, nothing to rollback');
			return;
		}

		// Delete all IssuedCredentialEntity records that were migrated from ResourceEntity
		const result = await queryRunner.manager
			.createQueryBuilder()
			.delete()
			.from(IssuedCredentialEntity)
			.where('providerId = :providerId', { providerId: studioProvider.providerId })
			.andWhere("metadata->>'migratedFrom' = :migratedFrom", { migratedFrom: 'ResourceEntity' })
			.execute();

		console.log(`Rolled back ${result.affected} migrated credentials`);
	}

	/**
	 * Resolve credential from DID URL using the resolver
	 */
	private async resolveCredential(didUrl: string): Promise<VerifiableCredential | null> {
		try {
			const response = await fetch(`${this.RESOLVER_URL}/${didUrl}`, {
				headers: {
					'Content-Type': '*/*',
					Accept: 'application/json',
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			// Validate that we received a credential
			if (!data || typeof data !== 'object') {
				throw new Error('Invalid response from resolver');
			}

			return data as VerifiableCredential;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`  Failed to resolve ${didUrl}: ${errorMessage}`);
			return null;
		}
	}
}
