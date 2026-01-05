import type { CredentialPayload, IVerifyResult, VerifiableCredential } from '@veramo/core';
import { OperationCategoryNameEnum, OperationNameEnum, VC_CONTEXT, VC_TYPE } from '../../types/constants.js';
import {
	CredentialCategory,
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
import { ProviderService } from './provider.service.js';
import { IssuedCredentialEntity } from '../../database/entities/issued-credential.entity.js';
import { Repository } from 'typeorm';
import { Connection } from '../../database/connection/connection.js';
import { StatusRegistryEntity } from '../../database/entities/status-registry.entity.js';

import {
	CheckStatusListOptions,
	CheqdCredentialStatus,
	StatusListType,
	StatusOptions,
	StatusRegistryState,
} from '../../types/credential-status.js';
import { validate as uuidValidate } from 'uuid';
import {
	BitstringStatusListResourceType,
	BitstringValidationResult,
	DefaultStatusList2021StatusPurposeTypes,
} from '@cheqd/did-provider-cheqd';
import { ICredentialStatusTrack, ITrackOperation } from '../../types/track.js';
import { eventTracker } from '../track/tracker.js';
import { VerificationOptions } from '../../types/shared.js';

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
			issuedCredentialId,
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

		// Phase 1: Atomic Index Reservation with CAS
		let reservedIndex: number | undefined;
		let statusRegistryId: string | undefined;
		if (statusOptions && !issuedCredentialId) {
			// Reserve index atomically using CAS pattern
			const reservation = await this.reserveStatusIndex(statusOptions, issuerDid, customer);
			reservedIndex = reservation.index;
			statusRegistryId = reservation.registryId;

			// Do not allow the issuer to override with a different index
			if (statusOptions.statusListIndex && statusOptions.statusListIndex !== reservedIndex) {
				throw new Error(`Expected statusListIndex ${reservedIndex} but got ${statusOptions.statusListIndex}`);
			}

			statusOptions.statusListIndex = reservedIndex;
		}

		// Phase 2: Create tracking record immediately to reserve the index
		// This ensures the index is tracked even if credential creation fails
		let trackingRecord: IssuedCredentialEntity;
		if (issuedCredentialId) {
			const existingRecord = await this.fetch(issuedCredentialId, customer);
			if (!existingRecord) {
				throw new Error(
					`Issued Credential with ID ${issuedCredentialId} not found for customer ${customer.customerId}`
				);
			}

			trackingRecord = existingRecord;
		} else {
			trackingRecord = await this.create(customer, {
				providerId: providerId || 'studio',
				issuerId: issuerDid,
				subjectId: subjectDid,
				format: (format || 'jsonld') as 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds',
				category: category || CredentialCategory.CREDENTIAL,
				type: type || ['VerifiableCredential'],
				status: 'issued',
				issuedAt: new Date(),
				statusRegistryId: statusRegistryId,
				statusIndex: reservedIndex,
				retryCount: 0,
			});
		}

		// Phase 3: Attempt credential creation with error handling
		try {
			let verifiableCredential: VerifiableCredential;
			let providerCredentialId: string | undefined;
			let credentialMetadata: Record<string, any> = {};
			let isSubjectInDatabase = false;
			let veramoHash: string | undefined;

			switch (providerId || connector) {
				case CredentialConnectors.Dock: {
					const dock = new DockIdentityService();
					// validate issuerDid in provider
					const existingIssuer = await dock.getDid(issuerDid, customer).catch(() => undefined);
					if (!existingIssuer) {
						// export from wallet
						const exportResult = await new IdentityServiceStrategySetup(
							customer.customerId
						).agent.exportDid(issuerDid, process.env.PROVIDER_EXPORT_PASSWORD || '', customer);
						// import into provider
						await dock.importDidV2(issuerDid, exportResult, process.env.PROVIDER_EXPORT_PASSWORD, customer);
					}
					const dockCredential = await dock.createCredential(credential, format, statusOptions, customer);
					verifiableCredential = dockCredential;
					providerCredentialId = dockCredential.id as string;
					credentialMetadata = {
						schema: dockCredential.credentialSchema,
						proof: dockCredential.proof,
						termsOfUse: additionalData.termsOfUse,
						contexts: [...(context || []), ...VC_CONTEXT],
					};
					break;
				}
				case CredentialConnectors.Resource:
				case CredentialConnectors.Studio:
				case CredentialConnectors.Verida:
				default: {
					const studioService = new IdentityServiceStrategySetup(customer.customerId);
					const verifiable_credential = await studioService.agent.createCredential(
						credential,
						format,
						statusOptions,
						customer
					);

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

					// Get resourceId from ResourceConnector response if available
					if (sendCredentialResponse && sendCredentialResponse.resourceId) {
						providerCredentialId = sendCredentialResponse.resourceId;
					} else {
						providerCredentialId = verifiable_credential.id;
					}

					// Check if subject DID exists in Veramo's identifier store
					isSubjectInDatabase = await studioService.agent.didExists(subjectDid, customer);

					// If subject DID is in database, store credential in Veramo's dataStore
					if (isSubjectInDatabase) {
						// Store credential in Veramo's dataStore and get the hash
						veramoHash = await studioService.agent.saveCredential(verifiable_credential, customer);

						// Calculate offer expiration (e.g., 30 days from now)
						const offerExpiresAt = new Date();
						offerExpiresAt.setDate(offerExpiresAt.getDate() + 30);
					}
					credentialMetadata = {
						schema: verifiable_credential.credentialSchema,
						proof: verifiable_credential.proof,
						resourceType: sendCredentialResponse?.resourceType,
						didUrl: sendCredentialResponse?.didUrl,
						termsOfUse: additionalData.termsOfUse,
						contexts: [...(context || []), ...VC_CONTEXT],
					};
					verifiableCredential = verifiable_credential;
					break;
				}
			}

			// Phase 4: Update tracking record with success details
			const credentialType = Array.isArray(verifiableCredential.type)
				? verifiableCredential.type
				: [verifiableCredential.type || 'VerifiableCredential'];

			// Determine status based on whether subject DID is in database
			const currentStatus = isSubjectInDatabase ? 'offered' : 'issued';

			// Calculate offer expiration if credential is offered
			let offerExpiresAt: Date | undefined;
			if (isSubjectInDatabase) {
				offerExpiresAt = new Date();
				offerExpiresAt.setDate(offerExpiresAt.getDate() + 30); // 30 days from now
			}

			await this.update(
				trackingRecord.issuedCredentialId,
				{
					providerCredentialId: providerCredentialId,
					metadata: credentialMetadata,
					status: currentStatus as 'issued' | 'offered',
				},
				customer
			);

			// Build update payload for fields not covered by the update() method
			const updatePayload: any = {
				type: credentialType,
				issuedAt: verifiableCredential.issuanceDate
					? new Date(verifiableCredential.issuanceDate)
					: trackingRecord.issuedAt,
				expiresAt: verifiableCredential.expirationDate
					? new Date(verifiableCredential.expirationDate)
					: undefined,
				credentialStatus: verifiableCredential.credentialStatus,
			};

			// Add offer-specific fields if credential is offered
			if (isSubjectInDatabase && offerExpiresAt) {
				updatePayload.offerExpiresAt = offerExpiresAt;
			}

			// Set veramoHash if credential was stored in Veramo
			if (veramoHash) {
				// We need to set the FK column directly since we have the hash
				updatePayload.veramoHash = veramoHash;
			}

			// Also update fields not covered by the update() method
			await this.repository.update({ issuedCredentialId: trackingRecord.issuedCredentialId }, updatePayload);

			return verifiableCredential;
		} catch (error) {
			// Phase 5: Update tracking record with failure details
			// This ensures the reserved index is tracked even when credential creation fails
			await this.repository.update(
				{ issuedCredentialId: trackingRecord.issuedCredentialId },
				{
					status: 'unknown',
					retryCount: trackingRecord.retryCount + 1,
					lastError: error instanceof Error ? error.message : String(error),
				}
			);

			// Re-throw the error so the caller knows the credential creation failed
			throw error;
		}
	}
	/**
	 * Phase 1: Atomic Index Reservation with CAS
	 * Reserves a unique index using Compare-And-Swap pattern
	 * Implements lock-free allocation with exponential backoff retry
	 */
	private async reserveStatusIndex(
		statusOptions: StatusOptions,
		issuerDid: string,
		customer: CustomerEntity,
		maxRetries: number = 5
	): Promise<{ index: number; registryId: string }> {
		let attempt = 0;
		const baseDelay = 5; // ms

		while (attempt < maxRetries) {
			// Step 1: Read current state (lock-free)
			// Query entity directly to get version field for CAS
			let statusRegistry: StatusRegistryEntity | null = null;

			if (statusOptions.statusListName && statusOptions.statusListType) {
				// Determine registryType based on statusListType and statusPurpose
				let registryType: string;
				if (statusOptions.statusListType === StatusListType.Bitstring) {
					registryType = BitstringStatusListResourceType;
				} else if (statusOptions.statusListType === StatusListType.StatusList2021) {
					// Capitalize first letter of statusPurpose (revocation -> Revocation)
					const capitalizedPurpose = statusOptions.statusPurpose
						? statusOptions.statusPurpose.charAt(0).toUpperCase() + statusOptions.statusPurpose.slice(1)
						: '';
					registryType = `${statusOptions.statusListType}${capitalizedPurpose}`;
				} else {
					registryType = statusOptions.statusListType;
				}

				statusRegistry = await this.statusRegistryRepository.findOne({
					where: {
						registryName: statusOptions.statusListName,
						registryType: registryType,
						customer: { customerId: customer.customerId },
						identifier: { did: issuerDid },
					},
					relations: ['identifier'],
				});
			}

			if (!statusRegistry) {
				throw new Error('Status Registry Not Found');
			}

			// Validation checks
			if (statusRegistry.state === StatusRegistryState.Full) {
				throw new Error('Status Registry is Full');
			}

			if (statusRegistry.state !== StatusRegistryState.Active) {
				throw new Error(`Status Registry is not Active. Current state: ${statusRegistry.state}`);
			}

			// Check capacity
			if (statusRegistry.writeCursor >= statusRegistry.registrySize) {
				throw new Error('Status Registry has reached capacity');
			}

			// Calculate next index
			let nextIndex = statusRegistry.writeCursor + 1;

			// Check if the next index is already used (from migration of historical credentials)
			const additionalUsedIndexes = (statusRegistry.metadata?.additionalUsedIndexes as number[]) || [];
			while (additionalUsedIndexes.includes(nextIndex)) {
				nextIndex++;
				// Safety check: ensure we don't exceed registry size
				if (nextIndex >= statusRegistry.registrySize) {
					throw new Error('Status Registry has reached capacity (including additional used indexes)');
				}
			}

			const currentVersion = statusRegistry.version;

			// Step 2: Reserve via Compare-And-Swap
			const updates: Partial<StatusRegistryEntity> = {
				writeCursor: nextIndex,
			};

			// Check if registry will be FULL after this allocation
			if (nextIndex >= statusRegistry.registrySize) {
				updates.state = StatusRegistryState.Full;
			}

			// Attempt CAS update using QueryBuilder
			const result = await this.statusRegistryRepository
				.createQueryBuilder()
				.update(StatusRegistryEntity)
				.set({
					...updates,
					version: currentVersion + 1,
					updatedAt: new Date(),
				})
				.where('registryId = :registryId', { registryId: statusRegistry.registryId })
				.andWhere('version = :version', { version: currentVersion })
				.execute();

			const casSuccess = (result.affected ?? 0) === 1;

			if (casSuccess) {
				// Success! Return reserved index and registryId

				// Check if we need to trigger rotation (threshold or full)
				// Calculate utilization including additional used indexes
				const totalUsedIndexes = nextIndex + additionalUsedIndexes.length;
				const utilizationPercent = (totalUsedIndexes / statusRegistry.registrySize) * 100;
				if (
					utilizationPercent >= statusRegistry.threshold_percentage ||
					nextIndex >= statusRegistry.registrySize
				) {
					const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
						category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
						name:
							nextIndex >= statusRegistry.registrySize
								? OperationNameEnum.CREDENTIAL_STATUS_FULL
								: OperationNameEnum.CREDENTIAL_STATUS_THRESHOLD_REACHED,
						customer: customer,
						data: {
							did: issuerDid,
							registryId: statusRegistry.registryId,
						},
					};

					// Track operation
					eventTracker.emit('track', trackInfo);
				}

				return { index: nextIndex, registryId: statusRegistry.registryId };
			}

			// CAS failed - concurrent modification detected
			attempt++;
			if (attempt < maxRetries) {
				// Exponential backoff
				const delay = Math.min(baseDelay * Math.pow(2, attempt), 1000);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw new Error(`Failed to reserve index after ${maxRetries} attempts - high concurrency`);
	}

	/**
	 * List issued credentials with pagination and filtering
	 */
	async list(
		customer: CustomerEntity,
		options: ListCredentialRequestOptions = {}
	): Promise<{ credentials: IssuedCredentialResponse[]; total: number }> {
		const {
			page,
			limit,
			providerId,
			providerCredentialId,
			issuerId,
			subjectId,
			status,
			format,
			createdAt,
			category,
			credentialType,
			network,
			statusRegistryId,
		} = options;

		// Used queryBuilder because of "type" filter which is JSON object in DB
		const queryBuilder = this.repository
			.createQueryBuilder('ic')
			.leftJoinAndSelect('ic.statusRegistry', 'statusRegistry')
			.where('ic.customerId = :customerId', { customerId: customer.customerId });

		if (providerId) queryBuilder.andWhere('ic.providerId = :providerId', { providerId });
		if (providerCredentialId && providerCredentialId.length > 0) {
			queryBuilder.andWhere('ic.providerCredentialId IN (:...providerCredentialId)', {
				providerCredentialId,
			});
		}
		if (issuerId) queryBuilder.andWhere('ic.issuerId = :issuerId', { issuerId });
		if (subjectId) queryBuilder.andWhere('ic.subjectId = :subjectId', { subjectId });
		if (status) queryBuilder.andWhere('ic.status = :status', { status });
		if (format) queryBuilder.andWhere('ic.format = :format', { format });
		if (category) queryBuilder.andWhere('ic.category = :category', { category });
		if (createdAt) queryBuilder.andWhere('ic.createdAt <= :createdAt', { createdAt: new Date(createdAt) });
		if (network) {
			// Filter by network in the DID (e.g., did:cheqd:mainnet:... or did:cheqd:testnet:...)
			queryBuilder.andWhere('ic.issuerId LIKE :network', { network: `%:${network}:%` });
		}
		if (credentialType) {
			if (credentialType === 'VerifiableCredential') {
				// Exact match for VerifiableCredential (only credentials with type = ["VerifiableCredential"])
				queryBuilder.andWhere('ic.type::jsonb = :credentialType::jsonb', {
					credentialType: JSON.stringify(['VerifiableCredential']),
				});
			} else {
				// Contains match for other types
				queryBuilder.andWhere('ic.type::jsonb @> :credentialType::jsonb', {
					credentialType: JSON.stringify([credentialType]),
				});
			}
		}
		if (statusRegistryId) {
			queryBuilder.andWhere('statusRegistry.registryId = :statusRegistryId', { statusRegistryId });
		}

		const [entities, total] = await queryBuilder
			.orderBy('ic.createdAt', 'DESC')
			.skip(page && limit ? (page - 1) * limit : 0)
			.take(limit || undefined)
			.getManyAndCount();

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
				relations: ['customer', 'statusRegistry'],
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
		// Resolve statusRegistry if statusRegistryId is provided
		let statusRegistry;
		if (options.statusRegistryId) {
			statusRegistry = await this.statusRegistryRepository.findOne({
				where: { registryId: options.statusRegistryId },
			});
		}

		const entity = new IssuedCredentialEntity(
			options.providerId,
			options.format,
			options.category || CredentialCategory.CREDENTIAL,
			options.type,
			options.issuedAt,
			customer,
			{
				providerCredentialId: options.providerCredentialId,
				issuerId: options.issuerId,
				subjectId: options.subjectId,
				status: options.status,
				statusUpdatedAt: options.statusUpdatedAt,
				metadata: options.metadata,
				credentialStatus: options.credentialStatus,
				statusRegistry: statusRegistry || undefined,
				statusIndex: options.statusIndex,
				retryCount: options.retryCount,
				lastError: options.lastError,
				expiresAt: options.expiresAt,
			}
		);

		return await this.repository.save(entity);
	}

	/**
	 * Update credential status
	 */
	async updateStatus(issuedCredentialId: string, status: string, customer: CustomerEntity): Promise<boolean> {
		const result = await this.repository.update(
			{
				issuedCredentialId,
				customer: { customerId: customer.customerId },
			},
			{
				status: status as 'issued' | 'suspended' | 'revoked',
				statusUpdatedAt: new Date(),
			}
		);

		return (result.affected ?? 0) > 0;
	}

	/**
	 * Update credential metadata
	 */
	async update(
		issuedCredentialId: string,
		updateData: Partial<Pick<IssuedCredentialEntity, 'providerCredentialId' | 'status' | 'metadata'>>,
		customer: CustomerEntity
	): Promise<IssuedCredentialResponse | null> {
		// Ensure the credential belongs to this customer
		const entity = await this.repository.findOne({
			where: {
				issuedCredentialId,
				customer: { customerId: customer.customerId },
			},
		});

		if (!entity) {
			return null;
		}

		// Update the entity
		const updatePayload: any = {
			...updateData,
			updatedAt: new Date(),
		};

		// If status is being updated, also update statusUpdatedAt
		if (updateData.status) {
			updatePayload.statusUpdatedAt = new Date();
		}

		await this.repository.update(
			{
				issuedCredentialId,
				customer: { customerId: customer.customerId },
			},
			updatePayload
		);

		// Fetch and return the updated entity
		const updatedEntity = await this.repository.findOne({
			where: {
				issuedCredentialId,
				customer: { customerId: customer.customerId },
			},
			relations: ['statusRegistry'],
		});

		if (!updatedEntity) {
			return null;
		}

		return this.toResponse(updatedEntity, {});
	}

	/**
	 * Fetch a single issued credential record by ID
	 */
	async fetch(id: string, customer: CustomerEntity): Promise<IssuedCredentialEntity | null> {
		// Try multiple lookup strategies
		let entity: IssuedCredentialEntity | null = null;

		// Strategy 1: Try as issuedCredentialId (UUID)
		if (uuidValidate(id)) {
			entity = await this.repository.findOne({
				where: {
					issuedCredentialId: id,
					customer: { customerId: customer.customerId },
				},
				relations: ['customer', 'statusRegistry'],
			});
		}

		return entity;
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
			statusRegistryId: entity.statusRegistry?.registryId,
			statusIndex: entity.statusIndex,
			retryCount: entity.retryCount,
			lastError: entity.lastError,
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

			let newStatus: string = 'issued';

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
						if (status.type === 'StatusList2021Entry') {
							const url = new URL(status.id);
							const currentStatus = await studioService.agent.checkStatusList2021(
								entity.issuerId || '',
								{
									...status,
									statusListName: url.searchParams.get('resourceName'),
								} as CheckStatusListOptions,
								customer
							);
							if (status.statusPurpose === DefaultStatusList2021StatusPurposeTypes.suspension) {
								newStatus = currentStatus.suspended ? 'suspended' : 'issued';
							} else {
								newStatus = currentStatus.revoked ? 'revoked' : 'issued';
							}
						} else {
							const currentStatus = (await studioService.agent.checkBitstringStatusList(
								entity.issuerId || '',
								status as CheqdCredentialStatus,
								customer
							)) as BitstringValidationResult;
							newStatus = currentStatus.message
								? currentStatus.message
								: currentStatus.valid
									? 'revoked'
									: 'issued';
						}
					}
					break;
				}
				default:
					console.warn(`Status sync not supported for provider: ${entity.providerId}`);
					return;
			}

			// Update the entity status if it changed
			if (newStatus && newStatus !== entity.status) {
				console.warn(
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
					console.warn(`Credential fetch not supported for provider: ${entity.providerId}`);
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

	async verify_credential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		let verificationResult: IVerifyResult;

		const studioService = new IdentityServiceStrategySetup(customer.customerId);
		verificationResult = await studioService.agent.verifyCredential(credential, verificationOptions, customer);

		// Only check external providers if customer is authenticated
		if (verificationOptions.policies?.checkExternalProvider) {
			// Get all active provider configurations for the customer
			const providerConfigs = await ProviderService.instance.getCustomerConfigurations(customer.customerId);
			const activeProviders = providerConfigs.filter((config) => config.active && config.providerId !== 'studio');

			// Verify with each activated external provider
			for (const providerConfig of activeProviders) {
				try {
					let externalResult: IVerifyResult | undefined;

					switch (providerConfig.providerId) {
						case 'dock': {
							const dockService = new DockIdentityService();
							externalResult = await dockService.verifyCredential(
								credential,
								verificationOptions,
								customer
							);
							break;
						}
						// TODO: Add other providers here as they implement verifyCredential
						default:
							console.warn(
								`Credential verification not supported for provider: ${providerConfig.providerId}`
							);
							continue;
					}

					// If external verification succeeds, use that result
					if (externalResult) {
						verificationResult = externalResult;
					}
				} catch (error) {
					console.error(
						`Failed to verify credential with provider ${providerConfig.providerId}:`,
						error instanceof Error ? error.message : error
					);
					// Don't fail the entire verification if one provider fails
					// Just log the error and continue
				}
			}
		}
		return verificationResult;
	}

	public async count(customer: CustomerEntity, where: Record<string, unknown>) {
		return await this.repository.count({
			where: {
				...where,
				customer: { customerId: customer.customerId },
			},
		});
	}
}
