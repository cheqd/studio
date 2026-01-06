import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { PublishRecordRequestBody, SearchRecordQuery, VerificationResult } from '../../types/record.js';

const execFileAsync = promisify(execFile);

/**
 * AgntcyService - Wraps dirctl CLI for self-hosted AGNTCY Directory
 */
export class AgntcyService {
	private directoryUrl: string;
	private oasfSchemaUrl: string;
	private dirctlCommand: string;

	constructor() {
		this.directoryUrl = process.env.DIRECTORY_SERVER_URL || 'localhost:8888';
		this.oasfSchemaUrl = process.env.OASF_SCHEMA_SERVER_URL || 'https://schema.oasf.outshift.com';
		this.dirctlCommand = process.env.DIRCTL_COMMAND || 'dirctl';
	}

	/**
	 * Execute dirctl command with proper flags
	 */
	private async execDirctl(args: string[]): Promise<string> {
		try {
			const fullArgs = ['--server', this.directoryUrl, ...args];

			const { stdout, stderr } = await execFileAsync(this.dirctlCommand, fullArgs, {
				maxBuffer: 10 * 1024 * 1024,
			});

			if (stderr && !stderr.includes('[Info]') && !stderr.includes('INFO')) {
				console.warn('dirctl stderr:', stderr);
			}

			return stdout;
		} catch (error: any) {
			console.error('dirctl error:', error);
			const errorMsg = error.stderr || error.message || 'Unknown error';
			throw new Error(`dirctl command failed: ${errorMsg}`);
		}
	}

	/**
	 * Convert request body to OASF record format
	 * Uses data from request instead of hardcoding
	 */
	private toOASFRecord(body: PublishRecordRequestBody): any {
		const { data } = body;

		return {
			metadata: {
				version: data.schema_version || '1.0.0',
				uid: data.uid || data.name, // Use uid if provided, fallback to name
				product: {
					name: data.name,
					vendor_name: data.authors?.[0] || 'Unknown',
					version: data.version,
					lang: 'en',
					url: data.locators?.find((l) => l.type === 'api_endpoint')?.url,
				},
				labels: data.type ? [data.type] : [],
			},
			record: {
				type_uid: '100001',
				type_name: data.type === 'mcp-server' ? 'MCP Server' : 'AI Agent',
				category_uid: '1',
				category_name: 'Agent',
				class_uid: '1001',
				class_name: data.type || 'Agent',
				severity_id: 1,
				time: data.created_at || new Date().toISOString(),
			},
			// Use data directly from request
			skills: data.skills?.map((skill) => ({
				skill_id: skill.name,
				skill_name: skill.name,
				confidence: 1.0,
			})) || [],
			domains: data.domains?.map((domain) => ({
				domain_id: domain.name,
				domain_name: domain.name,
			})) || [],
			locators: data.locators || [],
			modules: data.modules || [],
		};
	}

	/**
	 * Convert OASF record back to response format
	 */
	private fromOASFRecord(oasf: any): PublishRecordRequestBody {
		return {
			data: {
				name: oasf.metadata.product.name,
				version: oasf.metadata.product.version,
				schema_version: oasf.metadata.version,
				uid: oasf.metadata.uid, // Preserve identity
				description: oasf.metadata.product.url,
				authors: [oasf.metadata.product.vendor_name],
				created_at: oasf.record.time,
				type: oasf.metadata.labels?.[0] as any,
				skills: oasf.skills?.map((s: any) => ({
					name: s.skill_name || s.skill_id,
					id: 0,
				})) || [],
				domains: oasf.domains?.map((d: any) => ({
					name: d.domain_name || d.domain_id,
					id: 0,
				})) || [],
				locators: oasf.locators || [],
				modules: oasf.modules || [],
			},
		};
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
					schema_version: record.metadata.version,
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
			// Convert request body to OASF format
			const oasfRecord = this.toOASFRecord(record);

			// Validate
			const isValid = await this.validateOASFSchema(oasfRecord);
			if (!isValid) {
				throw new Error('OASF validation failed');
			}

			// Write to temp file
			const tempFile = `/tmp/agntcy-record-${Date.now()}.json`;
			await writeFile(tempFile, JSON.stringify(oasfRecord, null, 2));

			try {
				// Push to directory
				const output = await this.execDirctl(['push', tempFile, '--output', 'raw']);
				const cid = output.trim();

				if (!cid) {
					throw new Error('No CID returned from directory server');
				}

				// Auto-publish to DHT
				try {
					await this.execDirctl(['routing', 'publish', cid]);
				} catch (err) {
					console.warn('Failed to publish to DHT:', err);
				}

				return { cid };
			} finally {
				await unlink(tempFile).catch(() => {});
			}
		} catch (error) {
			console.error('Error publishing record:', error);
			throw new Error(`Failed to publish record: ${(error as Error).message}`);
		}
	}

	/**
	 * Search for records in directory
	 */
	async search(customer: CustomerEntity, query: SearchRecordQuery): Promise<{ records: PublishRecordRequestBody[]; total: number }> {
		try {
			const args = ['search', '--output', 'json'];

			if (query.name) args.push('--name', query.name);
			if (query.version) args.push('--version', query.version);
			if (query.skill) args.push('--skill', query.skill);
			if (query.domain) args.push('--domain', query.domain);
			if (query.locator) args.push('--locator', query.locator);
			if (query.type) args.push('--type', query.type);

			const output = await this.execDirctl(args);

			if (!output || output.trim() === '') {
				return { records: [], total: 0 };
			}

			const results = JSON.parse(output);

			const records = (results.records || results || [])
				.map((item: any) => {
					try {
						const oasf = typeof item.data === 'string' ? JSON.parse(item.data) : item;
						return this.fromOASFRecord(oasf);
					} catch (e) {
						console.error('Error parsing record:', e);
						return null;
					}
				})
				.filter(Boolean);

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
			const output = await this.execDirctl(['pull', cid, '--output', 'json']);
			const data = JSON.parse(output);
			const oasf = typeof data.data === 'string' ? JSON.parse(data.data) : data;

			return this.fromOASFRecord(oasf);
		} catch (error) {
			const errorMsg = (error as Error).message.toLowerCase();
			if (errorMsg.includes('not_found') || errorMsg.includes('not found') || errorMsg.includes('no such')) {
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
			const output = await this.execDirctl(['verify', cid, '--output', 'json']);
			const result = JSON.parse(output);

			return {
				verified: result.verified || false,
				signature: result.signature,
				signer: result.signer,
				timestamp: result.timestamp,
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
	 */
	async signRecord(customer: CustomerEntity, cid: string): Promise<{ signed: boolean; signature?: string }> {
		try {
			const output = await this.execDirctl(['sign', cid, '--output', 'json']);
			const result = JSON.parse(output);

			return {
				signed: result.signed || true,
				signature: result.signature,
			};
		} catch (error) {
			console.error('Error signing record:', error);
			throw new Error(`Failed to sign record: ${(error as Error).message}`);
		}
	}

	/**
	 * Search across distributed network
	 */
	async searchNetwork(customer: CustomerEntity, query: SearchRecordQuery): Promise<{ records: any[]; total: number }> {
		try {
			const args = ['routing', 'search', '--output', 'json'];

			if (query.skill) args.push('--skill', query.skill);
			if (query.domain) args.push('--domain', query.domain);

			const output = await this.execDirctl(args);

			if (!output || output.trim() === '') {
				return { records: [], total: 0 };
			}

			const results = JSON.parse(output);

			return {
				records: results.results || [],
				total: results.results?.length || 0,
			};
		} catch (error) {
			console.error('Error searching network:', error);
			throw new Error(`Failed to search network: ${(error as Error).message}`);
		}
	}

	/**
	 * Sync records from remote directory
	 */
	async syncFromRemote(customer: CustomerEntity, remoteUrl: string, cids?: string[]): Promise<{ synced: number; errors: string[] }> {
		try {
			const args = ['sync', 'create', remoteUrl, '--output', 'json'];

			if (cids && cids.length > 0) {
				args.push('--cids', cids.join(','));
			}

			const output = await this.execDirctl(args);
			const result = JSON.parse(output);

			return {
				synced: result.synced || 0,
				errors: result.errors || [],
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
			await this.execDirctl(['routing', 'unpublish', cid]);
			return { deleted: true };
		} catch (error) {
			console.error('Error deleting record:', error);
			throw new Error(`Failed to delete record: ${(error as Error).message}`);
		}
	}

	/**
	 * Update a record (creates new version with new CID)
	 */
	async updateRecord(customer: CustomerEntity, oldCid: string, record: PublishRecordRequestBody): Promise<{ cid: string }> {
		try {
			const oasfRecord = this.toOASFRecord(record);

			// Add reference to previous version
			if (!oasfRecord.metadata.labels) {
				oasfRecord.metadata.labels = [];
			}
			oasfRecord.metadata.labels.push(`prev_version:${oldCid}`);

			// Unpublish old version
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
			const output = await this.execDirctl(['info', cid, '--output', 'json']);
			return JSON.parse(output);
		} catch (error) {
			console.error('Error getting record info:', error);
			throw new Error(`Failed to get record info: ${(error as Error).message}`);
		}
	}
}