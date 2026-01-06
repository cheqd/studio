import { Client, Config, models } from 'agntcy-dir';
import { create } from '@bufbuild/protobuf';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { PublishRecordRequestBody, SearchRecordQuery, VerificationResult } from '../../types/record.js';

/**
 * AgntcyService - Uses official agntcy-dir npm package
 * Based on official examples from agntcy/dir repository
 *
 * Installation:
 * npm install agntcy-dir @bufbuild/protobuf
 */
export class AgntcyService {
	private client: Client;
	private oasfSchemaUrl: string;

	constructor() {
		const serverAddress = process.env.DIRECTORY_SERVER_URL || 'localhost:8888';
		const dirctlPath = process.env.DIRCTL_PATH || '/usr/local/bin/dirctl';

		this.oasfSchemaUrl = process.env.OASF_SCHEMA_SERVER_URL || 'https://schema.oasf.outshift.com';

		const config = new Config(serverAddress, dirctlPath);
		this.client = new Client(config);
	}

	/**
	 * Convert request body to OASF record format
	 * Must match the exact structure from the official example
	 */
	private toOASFRecord(body: PublishRecordRequestBody): any {
		const { data } = body;

		// Return the exact structure from the example - just the data wrapper
		return {
			data: {
				name: data.name,
				version: data.version,
				schema_version: data.schema_version || '0.7.0',
				description: data.description || '',
				authors: data.authors || [],
				created_at: data.created_at || new Date().toISOString(),
				uid: data.uid, // Include identity if provided
				type: data.type,
				skills: data.skills || [],
				locators: data.locators || [],
				domains: data.domains || [],
				modules: data.modules || [],
			},
		};
	}

	/**
	 * Convert OASF record back to response format
	 */
	private fromOASFRecord(record: any): PublishRecordRequestBody {
		const data = record.data || record;

		return {
			data: {
				name: data.name,
				version: data.version,
				schema_version: data.schema_version,
				uid: data.uid,
				description: data.description,
				authors: data.authors,
				created_at: data.created_at,
				type: data.type,
				skills: data.skills || [],
				locators: data.locators || [],
				domains: data.domains || [],
				modules: data.modules || [],
			},
		};
	}

	/**
	 * Create a RecordRef protobuf message
	 */
	private createRecordRef(cid: string) {
		return create(models.core_v1.RecordRefSchema, {
			cid: cid,
		});
	}

	/**
	 * Validate OASF record against schema server
	 */
	async validateOASFSchema(record: any): Promise<boolean> {
		try {
			if (process.env.SKIP_OASF_VALIDATION === 'true') {
				return true;
			}

			const response = await fetch(`${this.oasfSchemaUrl}/api/validate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schema_version: record.data?.schema_version || '0.7.0',
					record: record,
				}),
				signal: AbortSignal.timeout(10000),
			});

			const result = await response.json();

			if (response.ok && result.valid === true) {
				return true;
			}

			if (result.errors) {
				console.error('OASF validation errors:', result.errors);
			}

			return false;
		} catch (error) {
			console.error('Error validating OASF schema:', error);
			console.warn('OASF schema server unreachable, skipping validation');
			return true;
		}
	}

	/**
	 * Publish record to directory
	 */
	async publish(customer: CustomerEntity, record: PublishRecordRequestBody): Promise<{ cid: string }> {
		try {
			// Convert to OASF format (match example structure exactly)
			const oasfRecord = this.toOASFRecord(record);

			// Remove undefined/null fields to avoid protobuf errors
			const cleanRecord = JSON.parse(
				JSON.stringify(oasfRecord, (key, value) => {
					// Remove undefined and null values
					if (value === undefined || value === null) {
						return undefined;
					}
					// Remove empty strings for optional fields
					if (value === '' && key !== 'description') {
						return undefined;
					}
					return value;
				})
			);

			console.log('Publishing record:', JSON.stringify(cleanRecord, null, 2));

			// Push records
			const pushed_refs = await this.client.push([cleanRecord]);

			if (!pushed_refs || pushed_refs.length === 0) {
				throw new Error('No CID returned from directory server');
			}

			const cid = pushed_refs[0].cid;

			// Auto-publish to DHT for discovery
			try {
				const recordRefs = create(models.routing_v1.RecordRefsSchema, {
					refs: pushed_refs,
				});

				const publishRequest = create(models.routing_v1.PublishRequestSchema, {
					request: {
						case: 'recordRefs',
						value: recordRefs,
					},
				});

				await this.client.publish(publishRequest);
			} catch (err) {
				console.warn('Failed to publish to DHT:', err);
			}

			return { cid };
		} catch (error) {
			console.error('Error publishing record:', error);
			throw new Error(`Failed to publish record: ${(error as Error).message}`);
		}
	}

	/**
	 * Search for records in directory
	 */
	async search(
		customer: CustomerEntity,
		query: SearchRecordQuery
	): Promise<{ records: PublishRecordRequestBody[]; total: number }> {
		try {
			// Build search queries array
			const queries: any[] = [];

			if (query.skill) {
				queries.push({
					type: models.search_v1.RecordQueryType.SKILL_NAME,
					value: query.skill,
				});
			}

			if (query.skill_id) {
				queries.push({
					type: models.search_v1.RecordQueryType.SKILL_ID,
					value: query.skill_id.toString(),
				});
			}

			if (query.name) {
				queries.push({
					type: models.search_v1.RecordQueryType.NAME,
					value: query.name,
				});
			}

			if (query.domain) {
				queries.push({
					type: models.search_v1.RecordQueryType.DOMAIN_NAME,
					value: query.domain,
				});
			}

			// Create search request using protobuf
			const searchRequest = create(models.search_v1.SearchRecordsRequestSchema, {
				queries: queries.length > 0 ? queries : [],
				limit: query.limit || 20,
				offset: query.page ? (query.page - 1) * (query.limit || 20) : 0,
			});

			console.log('Search request:', JSON.stringify(searchRequest, null, 2));

			// Search using SDK
			const results = await this.client.searchRecords(searchRequest);

			console.log('Search results:', results);

			if (!results || results.length === 0) {
				return { records: [], total: 0 };
			}

			// Convert records to response format
			const records = results
				.map((response: any) => {
					try {
						// SearchRecordsResponse contains an optional 'record' field
						if (!response || !response.record) {
							console.warn('Response missing record field:', response);
							return null;
						}
						return this.fromOASFRecord(response.record);
					} catch (e) {
						console.error('Error parsing record:', e);
						return null;
					}
				})
				.filter(Boolean) as PublishRecordRequestBody[];

			return {
				records,
				total: records.length,
			};
		} catch (error) {
			console.error('Error searching records:', error);
			throw new Error(`Failed to search records: ${(error as Error).message}`);
		}
	}

	/**
	 * Get specific record by CID
	 */
	async getRecord(customer: CustomerEntity, cid: string): Promise<PublishRecordRequestBody | null> {
		try {
			// Create RecordRef using protobuf constructor
			const recordRef = this.createRecordRef(cid);

			// Pull record using SDK
			const results = await this.client.pull([recordRef]);

			if (!results || results.length === 0) {
				return null;
			}

			return this.fromOASFRecord(results[0]);
		} catch (error) {
			const errorMsg = (error as Error).message.toLowerCase();
			if (errorMsg.includes('not found') || errorMsg.includes('not_found')) {
				return null;
			}
			console.error('Error getting record:', error);
			throw new Error(`Failed to get record: ${(error as Error).message}`);
		}
	}

	/**
	 * Verify record signature
	 */
	async verifyRecord(customer: CustomerEntity, cid: string): Promise<VerificationResult> {
		try {
			// Note: The SDK might have a different verify API
			// For now, return unverified since we don't have signature in the example
			console.warn('Verify not implemented in example - returning unverified');

			return {
				verified: false,
				error: 'Verification not implemented',
			};
		} catch (error) {
			console.error('Error verifying record:', error);
			return {
				verified: false,
				error: (error as Error).message,
			};
		}
	}

	/**
	 * Sign a record using Sigstore
	 * Note: Requires dirctl binary for OIDC signing
	 */
	async signRecord(customer: CustomerEntity, cid: string): Promise<{ signed: boolean; signature?: string }> {
		try {
			// Note: Sign not shown in example
			// This would require dirctl and OIDC flow
			console.warn('Sign requires dirctl and OIDC - not implemented');

			throw new Error('Signing requires dirctl binary and OIDC authentication');
		} catch (error) {
			console.error('Error signing record:', error);
			throw new Error(`Failed to sign record: ${(error as Error).message}`);
		}
	}

	/**
	 * Search across distributed network
	 */
	async searchNetwork(
		customer: CustomerEntity,
		query: SearchRecordQuery
	): Promise<{ records: any[]; total: number }> {
		try {
			// Build routing queries
			const queries: any[] = [];

			if (query.skill) {
				queries.push({
					type: models.routing_v1.RecordQueryType.SKILL,
					value: query.skill,
				});
			}

			if (query.domain) {
				queries.push({
					type: models.routing_v1.RecordQueryType.DOMAIN,
					value: query.domain,
				});
			}

			// Create ListRequest using protobuf constructor
			const listRequest = create(models.routing_v1.ListRequestSchema, {
				queries: queries.length > 0 ? queries : [],
				limit: query.limit || 20,
			});

			// List published records
			const results = await this.client.list(listRequest);

			return {
				records: results || [],
				total: results?.length || 0,
			};
		} catch (error) {
			console.error('Error searching network:', error);
			throw new Error(`Failed to search network: ${(error as Error).message}`);
		}
	}

	/**
	 * Sync records from remote directory
	 */
	async syncFromRemote(
		customer: CustomerEntity,
		remoteUrl: string,
		cids?: string[]
	): Promise<{ synced: number; errors: string[] }> {
		try {
			// Note: Sync not shown in example
			console.warn('Sync not implemented in example');

			return {
				synced: 0,
				errors: ['Sync not implemented'],
			};
		} catch (error) {
			console.error('Error syncing records:', error);
			throw new Error(`Failed to sync records: ${(error as Error).message}`);
		}
	}

	/**
	 * Get OASF skills taxonomy
	 */
	async getSkillsTaxonomy(): Promise<any[]> {
		try {
			const response = await fetch(`${this.oasfSchemaUrl}/api/skills`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(10000),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch skills: ${response.statusText}`);
			}

			const data = await response.json();
			return data.skills || data || [];
		} catch (error) {
			console.error('Error fetching skills taxonomy:', error);
			return [];
		}
	}

	/**
	 * Get OASF domains taxonomy
	 */
	async getDomainsTaxonomy(): Promise<any[]> {
		try {
			const response = await fetch(`${this.oasfSchemaUrl}/api/domains`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(10000),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch domains: ${response.statusText}`);
			}

			const data = await response.json();
			return data.domains || data || [];
		} catch (error) {
			console.error('Error fetching domains taxonomy:', error);
			return [];
		}
	}

	/**
	 * Get OASF modules
	 */
	async getModules(): Promise<any[]> {
		try {
			const response = await fetch(`${this.oasfSchemaUrl}/api/modules`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(10000),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch modules: ${response.statusText}`);
			}

			const data = await response.json();
			return data.modules || data || [];
		} catch (error) {
			console.error('Error fetching modules:', error);
			return [];
		}
	}

	/**
	 * Get OASF schema versions
	 */
	async getSchemaVersions(): Promise<string[]> {
		try {
			const response = await fetch(`${this.oasfSchemaUrl}/api/versions`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(10000),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch versions: ${response.statusText}`);
			}

			const data = await response.json();
			return data.versions || data || [];
		} catch (error) {
			console.error('Error fetching schema versions:', error);
			return ['0.7.0'];
		}
	}

	/**
	 * Delete a record by CID (unpublishes from DHT)
	 */
	async deleteRecord(customer: CustomerEntity, cid: string): Promise<{ deleted: boolean }> {
		try {
			// Create RecordRef using protobuf constructor
			const recordRef = this.createRecordRef(cid);

			// Create RecordRefs using protobuf constructor
			const recordRefs = create(models.routing_v1.RecordRefsSchema, {
				refs: [recordRef],
			});

			// Create UnpublishRequest using protobuf constructor
			const unpublishRequest = create(models.routing_v1.UnpublishRequestSchema, {
				request: {
					case: 'recordRefs',
					value: recordRefs,
				},
			});

			// Unpublish from DHT
			await this.client.unpublish(unpublishRequest);

			// Delete from storage
			await this.client.delete([recordRef]);

			return { deleted: true };
		} catch (error) {
			console.error('Error deleting record:', error);
			throw new Error(`Failed to delete record: ${(error as Error).message}`);
		}
	}

	/**
	 * Update a record (creates new version with new CID)
	 */
	async updateRecord(
		customer: CustomerEntity,
		oldCid: string,
		record: PublishRecordRequestBody
	): Promise<{ cid: string }> {
		try {
			// Delete old version
			await this.deleteRecord(customer, oldCid);

			// Publish new version
			return await this.publish(customer, record);
		} catch (error) {
			console.error('Error updating record:', error);
			throw new Error(`Failed to update record: ${(error as Error).message}`);
		}
	}

	/**
	 * Get info about a record (metadata without pulling full content)
	 */
	async getRecordInfo(customer: CustomerEntity, cid: string): Promise<any> {
		try {
			// Create RecordRef using protobuf constructor
			const recordRef = this.createRecordRef(cid);

			// Lookup metadata
			const results = await this.client.lookup([recordRef]);

			if (!results || results.length === 0) {
				throw new Error('Record not found');
			}

			return results[0];
		} catch (error) {
			console.error('Error getting record info:', error);
			throw new Error(`Failed to get record info: ${(error as Error).message}`);
		}
	}
}
