import { MigrationInterface, QueryRunner } from 'typeorm';
import { StatusRegistryEntity } from '../entities/status-registry.entity.js';
import { IssuedCredentialEntity } from '../entities/issued-credential.entity.js';

/**
 * Updates writeCursor and additionalUsedIndexes for StatusRegistryEntity based on actual credential issuance
 * This migration:
 * 1. Queries IssuedCredential table for all credentials with credentialStatus
 * 2. Groups credentials by their status list URI
 * 3. For each status registry:
 *    - Finds all used indexes
 *    - Determines the sequential run from the beginning
 *    - Sets writeCursor to the last sequential index
 *    - Stores non-sequential indexes in metadata.additionalUsedIndexes
 */
export class UpdateWriteCursors1762775500000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "statusIndex" integer`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "retryCount" integer NOT NULL DEFAULT '0'`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "lastError" text`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "statusRegistryId" character varying`);
		await queryRunner.query(
			`ALTER TABLE "issuedCredential" ADD CONSTRAINT "FK_6b4613d35ce2050a5f1594bc3d4" FOREIGN KEY ("statusRegistryId") REFERENCES "statusRegistry"("registryId") ON DELETE NO ACTION ON UPDATE NO ACTION`
		);

		console.log('Starting writeCursor update migration...');

		// Get all status registries
		const statusRegistries = await queryRunner.manager.find(StatusRegistryEntity, {
			relations: ['customer'],
		});

		console.log(`Found ${statusRegistries.length} status registries to process`);

		let updatedCount = 0;
		let skippedCount = 0;

		for (const registry of statusRegistries) {
			try {
				console.log(`\nProcessing registry: ${registry.registryId} (${registry.uri})`);

				// Query all issued credentials that reference this status list URI
				// The credentialStatus contains resolver URLs, but we need to match the DID URL portion
				// Example: credentialStatus.id = "https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:...#123"
				// We need to extract the DID URL and match it against registry.uri
				const credentials = await queryRunner.manager
					.createQueryBuilder(IssuedCredentialEntity, 'ic')
					.where('"ic"."credentialStatus" IS NOT NULL')
					.andWhere(
						'("ic"."credentialStatus"->>\'id\' LIKE :uriPattern OR "ic"."credentialStatus"->>\'statusListCredential\' LIKE :uriPattern)',
						{
							uriPattern: `%${registry.uri}%`,
						}
					)
					.getMany();

				if (credentials.length === 0) {
					console.log(`  No credentials found, keeping writeCursor at ${registry.writeCursor}`);
					skippedCount++;
					continue;
				}

				// Extract statusListIndex values and filter out invalid ones
				const indexes: number[] = [];
				for (const cred of credentials) {
					const statusListIndex = cred.credentialStatus?.statusListIndex;
					if (statusListIndex !== null && statusListIndex !== undefined) {
						const indexNum = parseInt(String(statusListIndex), 10);
						if (!isNaN(indexNum) && indexNum >= 0) {
							indexes.push(indexNum);
						}
					}
				}

				if (indexes.length === 0) {
					console.log(`  No valid indexes found, keeping writeCursor at ${registry.writeCursor}`);
					skippedCount++;
					continue;
				}

				// Sort indexes in ascending order
				indexes.sort((a, b) => a - b);

				// Remove duplicates
				const uniqueIndexes = [...new Set(indexes)];

				console.log(
					`  Found ${uniqueIndexes.length} unique indexes: [${uniqueIndexes.slice(0, 10).join(', ')}${uniqueIndexes.length > 10 ? '...' : ''}]`
				);

				// Find the sequential run from the beginning
				const { writeCursor, additionalUsedIndexes } = this.analyzeIndexes(uniqueIndexes);

				console.log(`  Sequential run ends at: ${writeCursor}`);
				if (additionalUsedIndexes.length > 0) {
					console.log(
						`  Non-sequential indexes: [${additionalUsedIndexes.slice(0, 10).join(', ')}${additionalUsedIndexes.length > 10 ? '...' : ''}]`
					);
				}

				// Update the status registry
				const currentMetadata = registry.metadata || {};
				const updatedMetadata = {
					...currentMetadata,
					...(additionalUsedIndexes.length > 0 ? { additionalUsedIndexes } : {}),
				};

				await queryRunner.manager.update(
					StatusRegistryEntity,
					{ registryId: registry.registryId },
					{
						writeCursor: writeCursor,
						// Pass metadata as a raw JSON string expression so TypeORM accepts it for update operations
						metadata: () => `'${JSON.stringify(updatedMetadata).replace(/'/g, "''")}'`,
					}
				);

				console.log(`  ✓ Updated writeCursor to ${writeCursor}`);

				// Update IssuedCredential records to populate new fields
				let credentialUpdateCount = 0;
				for (const credential of credentials) {
					const statusListIndex = credential.credentialStatus?.statusListIndex;
					if (statusListIndex !== null && statusListIndex !== undefined) {
						const indexNum = parseInt(String(statusListIndex), 10);
						if (!isNaN(indexNum) && indexNum >= 0) {
							await queryRunner.manager.update(
								IssuedCredentialEntity,
								{ issuedCredentialId: credential.issuedCredentialId },
								{
									statusRegistry: registry,
									statusIndex: indexNum,
									retryCount: 0,
									lastError: undefined,
								}
							);
							credentialUpdateCount++;
						}
					}
				}

				console.log(`  ✓ Updated ${credentialUpdateCount} issued credentials`);
				updatedCount++;
			} catch (error) {
				console.error(`  ✗ Error processing registry ${registry.registryId}:`, error);
				// Continue with next registry
			}
		}

		console.log(`\nMigration complete:`);
		console.log(`  - Updated: ${updatedCount} registries`);
		console.log(`  - Skipped: ${skippedCount} registries`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('Rolling back writeCursor update migration...');

		// Reset all writeCursor values to 0 and remove additionalUsedIndexes from metadata
		const registries = await queryRunner.manager.find(StatusRegistryEntity);

		for (const registry of registries) {
			const metadata = registry.metadata || {};
			// Remove additionalUsedIndexes if present
			if (metadata.additionalUsedIndexes) {
				delete metadata.additionalUsedIndexes;
			}
			const metadataValue =
				Object.keys(metadata).length > 0
					? () => `'${JSON.stringify(metadata).replace(/'/g, "''")}'`
					: undefined;
			await queryRunner.manager.update(
				StatusRegistryEntity,
				{ registryId: registry.registryId },
				{
					writeCursor: 0,
					metadata: metadataValue,
				}
			);
		}

		console.log(`Rolled back ${registries.length} registries`);

		// Reset IssuedCredential fields before dropping columns (if they exist)
		try {
			await queryRunner.query(
				`UPDATE "issuedCredential" SET "statusRegistryId" = NULL, "statusIndex" = NULL, "retryCount" = 0, "lastError" = NULL WHERE "statusRegistryId" IS NOT NULL`
			);
			console.log('Cleared IssuedCredential status fields');
		} catch (error) {
			// Columns might not exist if migration was partially applied
			console.log('Skipped clearing IssuedCredential fields (columns may not exist)');
		}

		// Drop the new columns and foreign key constraint
		await queryRunner.query(
			`ALTER TABLE "issuedCredential" DROP CONSTRAINT IF EXISTS "FK_6b4613d35ce2050a5f1594bc3d4"`
		);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN IF EXISTS "statusRegistryId"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN IF EXISTS "lastError"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN IF EXISTS "retryCount"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN IF EXISTS "statusIndex"`);

		console.log('Dropped IssuedCredential columns');
	}

	/**
	 * Analyze indexes to find sequential run and non-sequential indexes
	 * @param sortedIndexes - Array of unique indexes sorted in ascending order
	 * @returns Object with writeCursor and additionalUsedIndexes
	 */
	private analyzeIndexes(sortedIndexes: number[]): {
		writeCursor: number;
		additionalUsedIndexes: number[];
	} {
		if (sortedIndexes.length === 0) {
			return { writeCursor: 0, additionalUsedIndexes: [] };
		}

		// Find the longest sequential run from the start
		// Sequential means each number is exactly 1 more than the previous
		let writeCursor = sortedIndexes[0];
		let i = 1;

		while (i < sortedIndexes.length) {
			// Check if this index is sequential (current = previous + 1)
			if (sortedIndexes[i] === writeCursor + 1) {
				writeCursor = sortedIndexes[i];
				i++;
			} else {
				// Found a gap, stop the sequential run
				break;
			}
		}

		// All remaining indexes are non-sequential
		const additionalUsedIndexes = sortedIndexes.slice(i);

		return { writeCursor, additionalUsedIndexes };
	}
}
