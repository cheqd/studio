import { MigrationInterface, QueryRunner } from 'typeorm';
import { ResourceEntity } from '../entities/resource.entity.js';
import { StatusRegistryEntity } from '../entities/status-registry.entity.js';
import {
	BitstringStatusList,
	LinkedResourceMetadataResolutionResult,
	StatusList2021Revocation,
	StatusList2021Suspension,
} from '@cheqd/did-provider-cheqd';
import { StatusRegistryState } from '../../types/credential-status.js';
import { CredentialCategory } from '../../types/credential.js';

/**
 * Migrates existing Status List resources from ResourceEntity to StatusRegistryEntity
 * This migration:
 * 1. Finds all ResourceEntity records with resourceType='BitstringStatusListCredential' | 'StatusList2021Revocation' | 'StatusList2021Suspension' | 'StatusList2021'
 * 2. Resolves status list data from DID URLs via resolver
 * 3. Creates corresponding StatusRegistryEntity records'
 */
export class MigrationsStatusLists1762775396083 implements MigrationInterface {
	private readonly RESOLVER_URL = 'https://resolver.cheqd.net/1.0/identifiers';
	private readonly BATCH_SIZE = 50; // Process statuslists in batches to avoid memory issues

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('Starting Studio status list migration...');

		// Find all status list resources
		const statusListResources = await queryRunner.manager.find(ResourceEntity, {
			where: [
				{ resourceType: 'BitstringStatusListCredential' },
				{ resourceType: 'StatusList2021Revocation' },
				{ resourceType: 'StatusList2021Suspension' },
				{ resourceType: 'StatusList2021' },
			],
			relations: ['identifier', 'customer'],
		});

		console.log(`Found ${statusListResources.length} statuslist resources`);

		if (statusListResources.length === 0) {
			console.log('No statuslist to migrate');
			return;
		}

		let successCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		const errors: Array<{ resourceId: string; error: string }> = [];

		// Remove duplicates by DID URL (constructed per resource) using a Set to keep first occurrence
		const seen = new Set<string>();
		const uniqueStatusLists = statusListResources.filter((res) => {
			const did = res?.identifier?.did ?? '';
			const didUrl = `${did}?resourceName=${res.resourceName}&resourceType=${res.resourceType}`;
			if (seen.has(didUrl)) return false;
			seen.add(didUrl);
			return true;
		});
		console.log(`${uniqueStatusLists.length} statuslist resources are unique and ready to migrate`);

		// Process statuslist in batches
		for (let i = 0; i < uniqueStatusLists.length; i += this.BATCH_SIZE) {
			const batch = uniqueStatusLists.slice(i, i + this.BATCH_SIZE);

			for (const resource of batch) {
				try {
					const didUrl = `${resource.identifier.did}?resourceName=${resource.resourceName}&resourceType=${resource.resourceType}`;
					// Check if already migrated
					const existing = await queryRunner.manager.findOne(StatusRegistryEntity, {
						where: {
							uri: didUrl,
						},
					});

					if (existing) {
						skippedCount++;
						continue;
					}

					// Resolve statuslist from DID URL
					const statuslist = await this.resolveStatusListResource(didUrl);

					if (!statuslist || !statuslist.resource) {
						throw new Error(`Failed to resolve statuslist from ${didUrl}`);
					}

					// Calculate registry size from the encoded list
					const registrySize = this.calculateRegistrySize(statuslist.resource);

					// Create StatusRegistryEntity
					const statusRegistryEntity = new StatusRegistryEntity({
						uri: `${resource.identifier.did}?resourceName=${resource.resourceName}&resourceType=${resource.resourceType}`,
						registryType: resource.resourceType,
						registryName: resource.resourceName,
						credentialCategory: CredentialCategory.CREDENTIAL,
						version: 0, // default version to 0 for migrated lists
						registrySize: registrySize,
						writeCursor: 0, // default writeCursor to 0 for migrated lists
						state: StatusRegistryState.Active,
						storageType: 'cheqd',
						metadata: {
							migratedFrom: 'ResourceEntity',
							originalResourceId: resource.resourceId,
						},
						identifier: resource.identifier,
						customer: resource.customer,
						deprecated: false,
						encrypted: resource.encrypted || false,
						threshold_percentage: 80,
					});

					await queryRunner.manager.save(StatusRegistryEntity, statusRegistryEntity);
					successCount++;

					if (successCount % 10 === 0) {
						console.log(`    Migrated ${successCount} statuslist so far...`);
					}
				} catch (error) {
					errorCount++;
					const errorMessage = error instanceof Error ? error.message : String(error);
					errors.push({
						resourceId: resource.resourceId,
						error: errorMessage,
					});
					console.error(`    Error migrating statuslist ${resource.resourceId}:`, errorMessage);
					// Continue with next statuslist
				}
			}

			// Small delay between batches
			if (i + this.BATCH_SIZE < statusListResources.length) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}

		console.log(`\nMigration completed:`);
		console.log(`  Successfully migrated: ${successCount}`);
		console.log(`  Skipped (already migrated): ${skippedCount}`);
		console.log(`  Errors: ${errorCount}\n`);
		console.log(`  Total processed: ${successCount + skippedCount + errorCount}/${statusListResources.length}`);
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
		console.log('Rolling back Studio statuslist migration...');

		// Delete all StatusRegistryEntity records that were migrated from ResourceEntity
		const result = await queryRunner.manager
			.createQueryBuilder()
			.delete()
			.from(StatusRegistryEntity)
			.andWhere("metadata->>'migratedFrom' = :migratedFrom", { migratedFrom: 'ResourceEntity' })
			.execute();

		console.log(`Rolled back ${result.affected} migrated statuslists`);
	}

	/**
	 * Calculate registry size from the statuslist resource
	 * The encodedList is base64url encoded, so we decode and calculate bit length
	 */
	private calculateRegistrySize(
		resource: StatusList2021Revocation | StatusList2021Suspension | BitstringStatusList
	): number {
		try {
			// Default size if we can't determine
			const DEFAULT_SIZE = 131072; // 128KB * 8 bits = 131,072 bits (default from design)

			// Extract encodedList from the credential subject
			const encodedList =
				(resource as any)?.credentialSubject?.encodedList ||
				(resource as any)?.credentialSubject?.statusList?.encodedList;

			if (!encodedList || typeof encodedList !== 'string') {
				console.warn('    No encodedList found, using default size');
				return DEFAULT_SIZE;
			}

			// Decode base64url to get byte length, then convert to bit length
			// base64url: each character represents 6 bits
			// Remove padding if present
			const cleanedEncodedList = encodedList.replace(/=/g, '');
			const byteLength = Math.ceil((cleanedEncodedList.length * 6) / 8);
			const bitLength = byteLength * 8;

			return bitLength > 0 ? bitLength : DEFAULT_SIZE;
		} catch (error) {
			console.warn('    Error calculating registry size:', error);
			return 131072; // Default fallback
		}
	}

	/**
	 * Resolve statuslist from DID URL using the resolver
	 */
	private async resolveStatusListResource(didUrl: string): Promise<{
		resource?: StatusList2021Revocation | StatusList2021Suspension | BitstringStatusList;
		resourceMetadata?: LinkedResourceMetadataResolutionResult;
	} | null> {
		try {
			// Build resolver URL for metadata first
			const url = new URL(`${this.RESOLVER_URL}/${didUrl}`);
			url.searchParams.set('resourceMetadata', 'true');
			console.log(`    Resolving statuslist resource from ${url.toString()}`);
			// Fetch resource metadata (DID resolution profile)
			const metaResp = await fetch(`${this.RESOLVER_URL}/${didUrl}`, {
				headers: {
					Accept: 'application/ld+json;profile=https://w3id.org/did-resolution',
				},
			});

			if (!metaResp.ok) {
				throw new Error(`HTTP ${metaResp.status}: ${metaResp.statusText}`);
			}

			const resourceMetadataVersioned = (await metaResp.json()) as any;

			// Handle resolver-level errors
			const arbitraryError = resourceMetadataVersioned?.didResolutionMetadata?.error;
			if (arbitraryError) {
				console.error(`  Resolver error for ${didUrl}: ${String(arbitraryError)}`);
				return null;
			}

			// If no linked resource metadata, nothing to fetch
			if (!resourceMetadataVersioned?.didDocumentMetadata?.linkedResourceMetadata) {
				console.error(`  No linkedResourceMetadata for ${didUrl}`);
				return null;
			}

			// Choose latest resource metadata: prefer entry without nextVersionId, else most recently created
			const linked = resourceMetadataVersioned.didDocumentMetadata.linkedResourceMetadata as Array<any>;
			const resourceMetadata =
				linked.find((r) => !r.nextVersionId) ||
				linked.sort((a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime())[0];

			if (!resourceMetadata) {
				console.error(`  Unable to determine resource metadata for ${didUrl}`);
				return null;
			}

			// Fetch the actual resource (remove resourceMetadata param)
			url.searchParams.delete('resourceMetadata');
			console.log(`    Resolving statuslist resource from ${url.toString()}`);
			const resourceResp = await fetch(url.toString(), {
				headers: {
					Accept: 'application/json',
				},
			});

			if (!resourceResp.ok) {
				throw new Error(`HTTP ${resourceResp.status}: ${resourceResp.statusText}`);
			}

			const resource = await resourceResp.json();

			return {
				resource,
				resourceMetadata,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`  Failed to resolve ${didUrl}: ${errorMessage}`);
			return null;
		}
	}
}
