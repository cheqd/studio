import type { CredentialPayload, VerifiableCredential } from '@veramo/core';
import { OperationCategoryNameEnum, OperationNameEnum, VC_CONTEXT, VC_TYPE } from '../../types/constants.js';
import {
	CredentialConnectors,
	GetIssuedCredentialOptions,
	IssuedCredentialCreateOptions,
	IssuedCredentialResponse,
	ListCredentialRequestOptions,
	type CredentialRequest,
} from '../../types/credential.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import { v4 } from 'uuid';
import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { VeridaDIDValidator } from '../../controllers/validator/did.js';
import { ResourceConnector } from '../connectors/resource.js';
import { DockIdentityService } from '../identity/providers/index.js';
import { IssuedCredentialEntity } from '../../database/entities/issued-credential.entity.js';
import { FindOptionsWhere, LessThanOrEqual, Repository } from 'typeorm';
import { Connection } from '../../database/connection/connection.js';
import { CheqdCredentialStatus } from '../../types/credential-status.js';
import { validate as uuidValidate } from 'uuid';
import { StatusRegistryEntity } from '../../database/entities/status-registry.entity.js';
import { ICredentialStatusTrack, ITrackOperation } from '../../types/track.js';
import { eventTracker } from '../track/tracker.js';
dotenv.config();

const { ENABLE_VERIDA_CONNECTOR } = process.env;

export class Credentials {
	public static instance = new Credentials();
	public repository: Repository<IssuedCredentialEntity>;
	public statusRegistryRepository: Repository<StatusRegistryEntity>;

	constructor() {
		this.repository = Connection.instance.dbConnection.getRepository(IssuedCredentialEntity);
		this.statusRegistryRepository = Connection.instance.dbConnection.getRepository(StatusRegistryEntity);
	}

	async issue_credential(request: CredentialRequest, customer: CustomerEntity): Promise<VerifiableCredential> {
		const {
			attributes,
			credentialName,
			credentialSummary,
			credentialSchema,
			issuerDid,
			subjectDid,
			type,
			expirationDate,
			credentialStatus,
			'@context': context,
			format,
			connector,
			credentialId,
			providerId,
			category,
			...additionalData
		} = request;

		const credential: CredentialPayload = {
			'@context': [...(context || []), ...VC_CONTEXT],
			type: [...new Set([...(type || []), VC_TYPE])],
			issuer: { id: issuerDid },
			credentialSchema,
			credentialSubject: {
				id: subjectDid,
				...attributes,
			},
			issuanceDate: new Date().toISOString(),
			...additionalData,
		};

		if (expirationDate) {
			credential.expirationDate = expirationDate;
		}

		const statusOptions = credentialStatus || null;

		if (statusOptions) {
			const statusRegistry = await this.statusRegistryRepository.findOne({
				where: {
					registryName: statusOptions?.statusListName,
					registryType: statusOptions.statusListType,
					version: statusOptions.statusListVersion,
					state: 'ACTIVE',
				},
				lock: { mode: 'pessimistic_write' },
			});

			if (!statusRegistry) {
				throw new Error('Status Registry Not Found');
			}

			const index = statusRegistry.lastAssignedIndex + 1;
			statusOptions.statusListIndex = index;
			statusRegistry.lastAssignedIndex = index;

			if (statusRegistry.lastAssignedIndex === statusRegistry.size) {
				statusRegistry.state = 'FULL';
			}

			await this.statusRegistryRepository.save(statusRegistry);

			// emit status full event
			if (statusRegistry.state === 'FULL') {
				const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
					category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
					name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED,
					customer: customer,
					data: {
						did: statusRegistry.issuerId,
						statusListName: statusRegistry.registryName,
						statusListType: statusRegistry.registryType,
						statusPurpose: statusOptions.statusPurpose,
					},
				};

				// Track operation
				eventTracker.emit('track', trackInfo);
			}
		}

		// Handle credential issuance and connector logic
		switch (providerId || connector) {
			case CredentialConnectors.Dock: {
				const dock = new DockIdentityService();
				// validate issuerDid in provider
				const existingIssuer = await dock.getDid(issuerDid, customer).catch(() => undefined);
				if (!existingIssuer) {
					// export from wallet
					const exportResult = await new IdentityServiceStrategySetup(customer.customerId).agent.exportDid(
						issuerDid,
						process.env.PROVIDER_EXPORT_PASSWORD || '',
						customer
					);
					// import into provider
					await dock.importDidV2(issuerDid, exportResult, process.env.PROVIDER_EXPORT_PASSWORD, customer);
				}
				const dockCredential = await dock.createCredential(credential, format, statusOptions, customer);
				const credentialType = Array.isArray(dockCredential.type)
					? dockCredential.type
					: [dockCredential.type || 'VerifiableCredential'];
				// Create IssuedCredentialEntity record
				await this.create(customer, {
					providerId: 'dock',
					providerCredentialId: dockCredential.id as string,
					issuerId: issuerDid,
					subjectId: subjectDid,
					format: (format || 'jwt') as 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds',
					type: credentialType,
					category: category,
					status: 'issued',
					issuedAt: dockCredential.issuanceDate ? new Date(dockCredential.issuanceDate) : new Date(),
					expiresAt: dockCredential.expirationDate ? new Date(dockCredential.expirationDate) : undefined,
					credentialStatus: dockCredential.credentialStatus,
					metadata: {
						schema: dockCredential.credentialSchema,
						proof: dockCredential.proof,
						termsOfUse: additionalData.termsOfUse,
						contexts: [...(context || []), ...VC_CONTEXT],
					},
				});

				return dockCredential;
			}
			case CredentialConnectors.Resource:
			case CredentialConnectors.Studio:
			case CredentialConnectors.Verida:
			default: {
				const verifiable_credential = await new IdentityServiceStrategySetup(
					customer.customerId
				).agent.createCredential(credential, format, statusOptions, customer);

				const isVeridaDid = new VeridaDIDValidator().validate(subjectDid);
				let sendCredentialResponse;
				if (
					ENABLE_VERIDA_CONNECTOR === 'true' &&
					connector === CredentialConnectors.Verida &&
					isVeridaDid.valid &&
					isVeridaDid.namespace
				) {
					if (!credentialSchema) throw new Error('Credential schema is required');

					// dynamic import to avoid circular dependency
					const { VeridaService } = await import('../connectors/verida.js');

					sendCredentialResponse = await VeridaService.instance.sendCredential(
						isVeridaDid.namespace,
						subjectDid,
						'New Verifiable Credential',
						verifiable_credential,
						credentialName || v4(),
						credentialSchema,
						credentialSummary
					);
				} else if (connector && connector === CredentialConnectors.Resource) {
					sendCredentialResponse = await ResourceConnector.instance.sendCredential(
						customer,
						issuerDid,
						verifiable_credential,
						credentialName || v4(),
						type ? type[0] : 'VerifiableCredential',
						v4(),
						undefined,
						credentialId
					);
				}

				// Create IssuedCredentialEntity record for Studio/Resource credentials
				// Get resourceId from ResourceConnector response if available
				let providerCredentialId: string | undefined;
				if (sendCredentialResponse && sendCredentialResponse.resourceId) {
					providerCredentialId = sendCredentialResponse.resourceId;
				} else {
					providerCredentialId = verifiable_credential.id;
				}
				const credentialType = Array.isArray(verifiable_credential.type)
					? verifiable_credential.type
					: [verifiable_credential.type || 'VerifiableCredential'];

				await this.create(customer, {
					providerId: 'studio',
					providerCredentialId,
					issuerId: issuerDid,
					subjectId: subjectDid,
					format: (format || 'jsonld') as 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds',
					type: credentialType,
					category: category,
					status: 'issued',
					issuedAt: verifiable_credential.issuanceDate
						? new Date(verifiable_credential.issuanceDate)
						: new Date(),
					expiresAt: verifiable_credential.expirationDate
						? new Date(verifiable_credential.expirationDate)
						: undefined,
					credentialStatus: verifiable_credential.credentialStatus,
					metadata: {
						schema: verifiable_credential.credentialSchema,
						proof: verifiable_credential.proof,
						resourceType: sendCredentialResponse?.resourceType,
						didUrl: sendCredentialResponse?.didUrl,
						termsOfUse: additionalData.termsOfUse,
						contexts: [...(context || []), ...VC_CONTEXT],
					},
				});

				return verifiable_credential;
			}
		}
	}

	/**
	 * List issued credentials with pagination and filtering
	 */
	async list(
		customer: CustomerEntity,
		options: ListCredentialRequestOptions = {}
	): Promise<{ credentials: IssuedCredentialResponse[]; total: number }> {
		const { page = 1, limit = 10, providerId, issuerId, subjectId, status, format, createdAt, category } = options;

		const where: FindOptionsWhere<IssuedCredentialEntity> = {
			customer: { customerId: customer.customerId },
		};

		if (providerId) where.providerId = providerId;
		if (issuerId) where.issuerId = issuerId;
		if (subjectId) where.subjectId = subjectId;
		if (status) where.status = status;
		if (format) where.format = format as any;
		if (createdAt) where.createdAt = LessThanOrEqual(new Date(createdAt));
		if (category) where.category = category as any;

		const [entities, total] = await this.repository.findAndCount({
			where,
			order: { createdAt: 'DESC' },
			skip: (page - 1) * limit,
			take: limit,
		});

		const credentials = entities.map((entity) => this.toResponse(entity, { includeCredential: false }));

		return { credentials, total };
	}
	/**
	 * Get a single issued credential by ID with optional credential payload
	 */
	async get(
		id: string,
		customer: CustomerEntity,
		options: GetIssuedCredentialOptions = {}
	): Promise<IssuedCredentialResponse | null> {
		const { includeCredential = false, syncStatus = false, providerId } = options;

		// Try multiple lookup strategies
		let entity: IssuedCredentialEntity | null = null;

		// Strategy 1: Try as issuedCredentialId (UUID)
		if (uuidValidate(id)) {
			entity = await this.repository.findOne({
				where: {
					issuedCredentialId: id,
					customer: { customerId: customer.customerId },
				},
				relations: ['customer'],
			});
		}

		// Strategy 2: Try as providerCredentialId with provider hint
		if (!entity && providerId) {
			entity = await this.repository.findOne({
				where: {
					providerCredentialId: id,
					providerId: providerId,
					customer: { customerId: customer.customerId },
				},
				relations: ['customer'],
			});
		}

		// Strategy 3: Search across all provider fields
		if (!entity) {
			entity = await this.repository.findOne({
				where: {
					providerCredentialId: id,
					customer: { customerId: customer.customerId },
				},
				relations: ['customer'],
			});
		}
		if (!entity) {
			return null;
		}

		// Sync status from provider if requested
		if (syncStatus) {
			await this.syncStatusFromProvider(entity);
			// Reload entity from database to get updated status
			const updatedEntity = await this.repository.findOne({
				where: {
					issuedCredentialId: entity.issuedCredentialId,
				},
				relations: ['customer'],
			});
			if (updatedEntity) {
				entity = updatedEntity;
			}
		}

		// Optionally include full credential
		let credential: VerifiableCredential | null = null;
		if (includeCredential) {
			credential = await this.fetchCredentialFromProvider(entity);
		}
		return this.toResponse(entity, { includeCredential, credential: credential ?? undefined });
	}
	/**
	 * Create a new issued credential record
	 */
	async create(customer: CustomerEntity, options: IssuedCredentialCreateOptions): Promise<IssuedCredentialEntity> {
		const entity = this.repository.create({
			providerId: options.providerId,
			providerCredentialId: options.providerCredentialId,
			issuerId: options.issuerId,
			subjectId: options.subjectId,
			format: options.format,
			category: options.category || 'credential',
			type: options.type,
			status: options.status || 'issued',
			statusUpdatedAt: options.statusUpdatedAt,
			issuedAt: options.issuedAt,
			expiresAt: options.expiresAt,
			credentialStatus: options.credentialStatus,
			metadata: options.metadata,
			customer: customer,
		});

		return await this.repository.save(entity);
	}

	/**
	 * Update credential status
	 */
	async updateStatus(
		issuedCredentialId: string,
		status: 'issued' | 'suspended' | 'revoked',
		customer: CustomerEntity
	): Promise<boolean> {
		const result = await this.repository.update(
			{
				issuedCredentialId,
				customer: { customerId: customer.customerId },
			},
			{
				status,
				statusUpdatedAt: new Date(),
			}
		);

		return (result.affected ?? 0) > 0;
	}

	/**
	 * Convert entity to API response format
	 */
	private toResponse(
		entity: IssuedCredentialEntity,
		options: { includeCredential?: boolean; credential?: VerifiableCredential }
	): IssuedCredentialResponse {
		const response: IssuedCredentialResponse = {
			issuedCredentialId: entity.issuedCredentialId,
			providerId: entity.providerId,
			providerCredentialId: entity.providerCredentialId,
			issuerId: entity.issuerId,
			subjectId: entity.subjectId,
			format: entity.format,
			category: entity.category,
			type: entity.type,
			status: entity.status,
			statusUpdatedAt: entity.statusUpdatedAt?.toISOString(),
			issuedAt: entity.issuedAt.toISOString(),
			expiresAt: entity.expiresAt?.toISOString(),
			credentialStatus: entity.credentialStatus,
			createdAt: entity.createdAt?.toISOString(),
			updatedAt: entity.updatedAt?.toISOString(),
		};

		// Add provider metadata (excluding internal migration info)
		if (entity.metadata) {
			const { migratedFrom, ...providerMetadata } = entity.metadata;
			if (Object.keys(providerMetadata).length > 0) {
				response.providerMetadata = providerMetadata;
			}
		}

		// Include credential if requested
		if (options.includeCredential && options.credential) {
			response.credential = options.credential;
		}

		return response;
	}
	/**
	 * Sync credential status from provider API
	 */
	private async syncStatusFromProvider(entity: IssuedCredentialEntity): Promise<void> {
		try {
			const customer = entity.customer;
			if (!customer) {
				console.error('Customer not found for credential', entity.issuedCredentialId);
				return;
			}

			const credentialId = entity.providerCredentialId;
			if (!credentialId) {
				console.error('Provider credential ID not found', entity.issuedCredentialId);
				return;
			}

			let newStatus: 'issued' | 'suspended' | 'revoked' | null = null;

			switch (entity.providerId) {
				case 'dock': {
					// For Dock, fetch credential and check credentialStatus
					const credential = await this.fetchCredentialFromProvider(entity);
					if (credential) {
						// TODO: Implement full status list resolution when revocationRegistry is used
						newStatus = credential.revoked ? 'revoked' : 'issued';
					}
					break;
				}
				case 'studio': {
					// For Studio, use checkStatusList function when credentialStatus field exists in database
					if (entity.credentialStatus) {
						const status = entity.credentialStatus;
						const studioService = new IdentityServiceStrategySetup(customer.customerId);
						// TODO: Implement checkBitstringStatusList as part of credential Status check
						const currentStatus = await studioService.agent.checkBitstringStatusList(
							status as CheqdCredentialStatus,
							customer
						);

						newStatus = currentStatus.revoked
							? 'revoked'
							: currentStatus.suspended
								? 'suspended'
								: 'issued';
					}
					break;
				}
				default:
					console.log(`Status sync not supported for provider: ${entity.providerId}`);
					return;
			}

			// Update the entity status if it changed
			if (newStatus && newStatus !== entity.status) {
				console.log(
					`Updating credential ${entity.issuedCredentialId} status from ${entity.status} to ${newStatus}`
				);
				await this.updateStatus(entity.issuedCredentialId, newStatus, customer);
			}
		} catch (error) {
			console.error(
				`Failed to sync status from provider ${entity.providerId}:`,
				error instanceof Error ? error.message : error
			);
		}
	}

	/**
	 * Fetch full credential from provider
	 */
	private async fetchCredentialFromProvider(entity: IssuedCredentialEntity): Promise<VerifiableCredential | null> {
		try {
			const customer = entity.customer;
			if (!customer) {
				console.error('Customer not found for credential', entity.issuedCredentialId);
				return null;
			}

			// Use providerCredentialId to fetch from the appropriate provider
			const credentialId = entity.providerCredentialId;
			if (!credentialId) {
				console.error('Provider credential ID not found', entity.issuedCredentialId);
				return null;
			}
			console.log(`Fetching credential from provider ${entity.providerId} with ID ${credentialId}`);
			switch (entity.providerId) {
				case 'dock': {
					const dockService = new DockIdentityService();
					return await dockService.getCredential(credentialId, customer);
				}
				case 'studio': {
					const studioService = new IdentityServiceStrategySetup(customer.customerId);
					return await studioService.agent.getCredential(credentialId, customer);
				}
				default:
					console.log(`Credential fetch not supported for provider: ${entity.providerId}`);
					return null;
			}
		} catch (error) {
			console.error(
				`Failed to fetch credential from provider ${entity.providerId}:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}
}
