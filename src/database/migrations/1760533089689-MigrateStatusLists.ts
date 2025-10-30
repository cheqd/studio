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

/**
 * Migrates existing Status List resources from ResourceEntity to StatusRegistryEntity
 * This migration:
 * 1. Finds all ResourceEntity records with resourceType='BitstringStatusListCredential' | 'StatusList2021Revocation' | 'StatusList2021Suspension' | 'StatusList2021'
 * 2. Resolves status list data from DID URLs via resolver
 * 3. Creates corresponding StatusRegistryEntity records'
 */
export class MigrateStatusLists1760533089689 implements MigrationInterface {
	private readonly RESOLVER_URL = process.env.RESOLVER_URL || 'https://resolver.cheqd.net';
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

		console.log(`Found ${statusListResources.length} statuslist resources to migrate`);

		if (statusListResources.length === 0) {
			console.log('No statuslist to migrate');
			return;
		}

		let successCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		const errors: Array<{ resourceId: string; error: string }> = [];

		// remove duplicates from statusListResources based on (did, resourceName, resourceType) and keep only latest
		const grouped = new Map<string, (typeof statusListResources)[number]>();

		for (const res of statusListResources) {
			const key = `${res?.identifier?.did ?? ''}::${res?.resourceName ?? ''}::${res?.resourceType ?? ''}`;
			const existing = grouped.get(key);
			if (!existing) {
				grouped.set(key, res);
				continue;
			}

			const existingTs = existing.createdAt;
			const currentTs = res.createdAt;
			// keep the one with the latest timestamp (if equal, prefer current so it overrides)
			if (new Date(currentTs) >= new Date(existingTs)) {
				grouped.set(key, res);
			}
		}

		const uniqueStatusListResources = Array.from(grouped.values());

		// Process statuslist in batches
		for (let i = 0; i < uniqueStatusListResources.length; i += this.BATCH_SIZE) {
			const batch = uniqueStatusListResources.slice(i, i + this.BATCH_SIZE);

			for (const resource of batch) {
				try {
					// Check if already migrated
					const existing = await queryRunner.manager.findOne(StatusRegistryEntity, {
						where: {
							registryType: resource.resourceType,
							identifier: { did: resource.identifier.did },
							uri: `${resource.identifier.did}?resourceName=${resource.resourceName}&resourceType=${resource.resourceType}`,
						},
					});

					if (existing) {
						skippedCount++;
						continue;
					}

					// Resolve statuslist from DID URL
					const didUrl = `${resource.identifier.did}/resources/${resource.resourceId}`;
					const statuslist = await this.resolveStatusListResource(didUrl);

					if (!statuslist || !statuslist.resource) {
						throw new Error(`Failed to resolve statuslist from ${didUrl}`);
					}

					// Create StatusRegistryEntity
					const statusRegistryEntity = queryRunner.manager.create(StatusRegistryEntity, {
						registryType: resource.resourceType,
						storageType: 'cheqd',
						registryName: resource.resourceName,
						identifier: resource.identifier,
						version: statuslist.resourceMetadata?.resourceVersion || '',
						uri: `${resource.identifier.did}?resourceName=${resource.resourceName}&resourceType=${resource.resourceType}`,
						customer: resource.customer,
						deprecated: false,
						state: StatusRegistryState.Active,
						size: 0,
						lastAssignedIndex: 0,
						metadata: {
							migratedFrom: 'ResourceEntity',
						},
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

			// Fetch resource metadata (DID resolution profile)
			const metaResp = await fetch(url.toString(), {
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
