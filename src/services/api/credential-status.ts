import { fromString } from 'uint8arrays';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import type {
	CheqdCredentialStatus,
	CreateEncryptedBitstringSuccessfulResponseBody,
	CreateUnencryptedBitstringSuccessfulResponseBody,
	FeePaymentOptions,
	ListStatusListQuery,
	StatusListRecord,
} from '../../types/credential-status.js';
import { DefaultStatusActionPurposeMap, StatusRegistryState, StatusListType } from '../../types/credential-status.js';
import type {
	CreateEncryptedStatusListRequestBody,
	CreateEncryptedStatusListRequestQuery,
	CreateEncryptedStatusListSuccessfulResponseBody,
	CreateUnencryptedStatusListRequestBody,
	CreateUnencryptedStatusListRequestQuery,
	CreateUnencryptedStatusListSuccessfulResponseBody,
	UpdateEncryptedStatusListRequestBody,
	UpdateUnencryptedStatusListRequestBody,
	UpdateUnencryptedStatusListRequestQuery,
	CheckStatusListRequestBody,
	CheckStatusListRequestQuery,
	SearchStatusListQuery,
} from '../../types/credential-status.js';
import {
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	BulkBitstringUpdateResult,
	DefaultStatusList2021StatusPurposeType,
	Cheqd,
	BitstringStatusListPurposeType,
} from '@cheqd/did-provider-cheqd';
import { toNetwork } from '../../helpers/helpers.js';
import { eventTracker } from '../track/tracker.js';
import type { ICredentialStatusTrack, ITrackOperation, IFeePaymentOptions } from '../../types/track.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { FeeAnalyzer } from '../../helpers/fee-analyzer.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import { FindOptionsRelations, FindOptionsWhere, In, Like, Repository } from 'typeorm';
import { StatusRegistryEntity } from '../../database/entities/status-registry.entity.js';
import { Connection } from '../../database/connection/connection.js';
import { v4 } from 'uuid';
import { IdentifierService } from './identifier.js';
import { CredentialCategory } from '../../types/credential.js';
import { StatusCodes } from 'http-status-codes';
import { IssuedCredentialEntity } from '../../database/entities/issued-credential.entity.js';

export class CredentialStatusService {
	public static instance = new CredentialStatusService();
	public repository: Repository<StatusRegistryEntity>;
	public issuedCredentialRepository: Repository<IssuedCredentialEntity>;

	constructor() {
		this.repository = Connection.instance.dbConnection.getRepository(StatusRegistryEntity);
		this.issuedCredentialRepository = Connection.instance.dbConnection.getRepository(IssuedCredentialEntity);
	}
	async createUnencryptedStatusList(
		body: CreateUnencryptedStatusListRequestBody,
		query: CreateUnencryptedStatusListRequestQuery,
		customer: CustomerEntity,
		user?: UserEntity
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: CreateUnencryptedStatusListSuccessfulResponseBody | CreateUnencryptedBitstringSuccessfulResponseBody;
		error?: string;
	}> {
		const {
			did,
			encodedList,
			statusListName,
			alsoKnownAs,
			statusListVersion = '1.0',
			length,
			encoding,
			statusSize: size,
			ttl,
			statusMessages,
			state,
			credentialCategory = CredentialCategory.CREDENTIAL,
		} = body;

		const { listType, statusPurpose } = query;

		const data = encodedList ? fromString(encodedList, encoding) : undefined;
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			// validate identifier
			const identifier = await IdentifierService.instance.get(did, customer);
			if (!identifier) {
				return {
					success: false,
					statusCode: StatusCodes.NOT_FOUND,
					error: `Identifier ${did} not found for the customer ${customer.customerId}`,
				};
			}

			if (data) {
				let result;
				if (listType === StatusListType.Bitstring) {
					result = await identityServiceStrategySetup.agent.broadcastBitstringStatusList(
						did,
						{
							data,
							name: statusListName,
							alsoKnownAs,
							version: statusListVersion,
						},
						customer
					);
				} else {
					result = await identityServiceStrategySetup.agent.broadcastStatusList2021(
						did,
						{
							data,
							name: statusListName,
							alsoKnownAs,
							version: statusListVersion,
						},
						{ encoding, statusPurpose: statusPurpose as DefaultStatusList2021StatusPurposeType },
						customer
					);
				}
				return {
					success: result,
					statusCode: StatusCodes.OK,
					data,
				};
			}

			let result:
				| CreateUnencryptedStatusListSuccessfulResponseBody
				| CreateUnencryptedBitstringSuccessfulResponseBody;
			let statusSize: number;

			if (listType === StatusListType.Bitstring) {
				result = (await identityServiceStrategySetup.agent.createUnencryptedBitstringStatusList(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						size,
						statusMessages,
						ttl,
						encoding,
						statusPurpose,
					},
					customer
				)) as CreateUnencryptedBitstringSuccessfulResponseBody;

				statusSize = result.resource.metadata.length;
			} else {
				result = (await identityServiceStrategySetup.agent.createUnencryptedStatusList2021(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						encoding,
						statusPurpose: statusPurpose as DefaultStatusList2021StatusPurposeType,
					},
					customer
				)) as CreateUnencryptedStatusListSuccessfulResponseBody;
				statusSize = length || Cheqd.defaultStatusList2021Length;
			}

			if (result.error) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: result.error?.message || result.error.toString(),
				};
			}

			// persist status list in the db
			const statusRegistry = new StatusRegistryEntity({
				registryId: v4(),
				uri: `${did}?resourceName=${result.resourceMetadata.resourceName}&resourceType=${result.resourceMetadata.resourceType}`,
				registryType: result.resourceMetadata.resourceType,
				registryName: statusListName,
				credentialCategory,
				version: 1,
				registrySize: statusSize,
				writeCursor: 0,
				state: state || StatusRegistryState.Active,
				storageType: 'cheqd',
				identifier,
				customer,
				metadata: {
					statusPurpose,
				},
			});
			await this.repository.save(statusRegistry);

			const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
				category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
				name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED,
				customer,
				user,
				data: {
					did,
					registryId: statusRegistry.registryId,
					resource: result.resourceMetadata,
					encrypted: result.resource?.metadata?.encrypted,
					symmetricKey: '',
				},
			};

			eventTracker.emit('track', trackInfo);

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: result,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}

	async createEncryptedStatusList(
		body: CreateEncryptedStatusListRequestBody,
		query: CreateEncryptedStatusListRequestQuery,
		customer: CustomerEntity,
		user?: UserEntity
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: CreateEncryptedStatusListSuccessfulResponseBody | CreateEncryptedBitstringSuccessfulResponseBody;
		error?: string;
	}> {
		const {
			did,
			statusListName,
			alsoKnownAs,
			statusListVersion = '1.0',
			length,
			statusSize: size,
			ttl,
			statusMessages,
			encoding,
			paymentConditions,
			feePaymentAddress,
			feePaymentAmount,
			feePaymentWindow,
			state,
			credentialCategory = CredentialCategory.CREDENTIAL,
		} = body;

		const { listType, statusPurpose } = query;
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			let result:
				| CreateEncryptedStatusListSuccessfulResponseBody
				| CreateEncryptedBitstringSuccessfulResponseBody;
			let statusSize: number;

			// validate identifier
			const identifier = await IdentifierService.instance.get(did, customer);
			if (!identifier) {
				return {
					success: false,
					statusCode: StatusCodes.NOT_FOUND,
					error: `Identifier ${did} not found for the customer ${customer.customerId}`,
				};
			}

			if (listType === StatusListType.Bitstring) {
				result = (await identityServiceStrategySetup.agent.createEncryptedBitstringStatusList(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						size,
						statusMessages,
						ttl,
						encoding,
						statusPurpose,
						paymentConditions,
						feePaymentAddress,
						feePaymentAmount,
						feePaymentWindow,
					},
					customer
				)) as CreateEncryptedBitstringSuccessfulResponseBody;
				statusSize = result.resource.metadata.length;
			} else {
				result = (await identityServiceStrategySetup.agent.createEncryptedStatusList2021(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						encoding,
						statusPurpose: statusPurpose as DefaultStatusList2021StatusPurposeType,
						paymentConditions,
						feePaymentAddress,
						feePaymentAmount,
						feePaymentWindow,
					},
					customer
				)) as CreateEncryptedStatusListSuccessfulResponseBody;
				statusSize = size || Cheqd.defaultStatusList2021Length;
			}

			if (result.error) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: result.error?.message || result.error.toString(),
				};
			}

			// persist status list in the db
			const statusRegistry = new StatusRegistryEntity({
				registryId: v4(),
				uri: `${did}?resourceName=${result.resourceMetadata.resourceName}&resourceType=${result.resourceMetadata.resourceType}`,
				registryType: result.resourceMetadata.resourceType,
				registryName: statusListName,
				credentialCategory,
				version: 1,
				registrySize: statusSize,
				writeCursor: 0,
				state: state || StatusRegistryState.Active,
				storageType: 'cheqd',
				identifier,
				customer,
				encrypted: true,
				metadata: {
					statusPurpose,
					paymentConditions,
					feePaymentAddress,
					feePaymentAmount,
					feePaymentWindow,
				},
			});
			await this.repository.save(statusRegistry);
			const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
				name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED,
				category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
				customer,
				user,
				data: {
					did,
					registryId: statusRegistry.registryId,
					resource: result.resourceMetadata,
					encrypted: true,
					symmetricKey: '',
				},
				feePaymentOptions: [],
			};

			eventTracker.emit('track', trackInfo);

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: result,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}

	async updateUnencryptedStatusList(
		body: UpdateUnencryptedStatusListRequestBody,
		query: UpdateUnencryptedStatusListRequestQuery,
		customer: CustomerEntity,
		user?: UserEntity
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: any;
		error?: string;
	}> {
		const { did, statusListName, statusListVersion = '1.0', indices } = body;
		const { statusAction, listType } = query;

		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			const unencrypted = await identityServiceStrategySetup.agent.searchStatusList(
				did,
				statusListName,
				listType,
				DefaultStatusActionPurposeMap[statusAction]
			);

			if (unencrypted.error) {
				if (unencrypted.error === 'notFound') {
					return {
						success: false,
						statusCode: StatusCodes.NOT_FOUND,
						error: `update: error: status list '${statusListName}' not found`,
					};
				}
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: `update: error: ${unencrypted.error}`,
				};
			}

			if (unencrypted.resource?.metadata?.encrypted) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: `update: error: status list '${statusListName}' is encrypted`,
				};
			}

			const result = (await identityServiceStrategySetup.agent.updateUnencryptedStatusList(
				did,
				listType,
				{
					indices: typeof indices === 'number' ? [indices] : indices,
					statusListName,
					statusListVersion,
					statusAction,
				},
				customer
			)) as (BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult) & {
				updated?: boolean;
			};

			result.updated = (function (that) {
				if (
					(that as BulkRevocationResult)?.revoked?.every((item) => !!item) &&
					(that as BulkRevocationResult)?.revoked?.length !== 0
				)
					return true;

				if (
					(that as BulkSuspensionResult)?.suspended?.every((item) => !!item) &&
					(that as BulkSuspensionResult)?.suspended?.length !== 0
				)
					return true;

				if (
					(that as BulkUnsuspensionResult)?.unsuspended?.every((item) => !!item) &&
					(that as BulkUnsuspensionResult)?.unsuspended?.length !== 0
				)
					return true;

				return false;
			})(result);

			if (result.error) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: result.error?.message || result.error.toString(),
				};
			}

			const formatted = {
				updated: true,
				revoked: (result as BulkRevocationResult)?.revoked || undefined,
				suspended: (result as BulkSuspensionResult)?.suspended || undefined,
				unsuspended: (result as BulkUnsuspensionResult)?.unsuspended || undefined,
				resource: result.statusList,
				resourceMetadata: result.resourceMetadata,
			};

			if (result.resourceMetadata) {
				const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
					category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
					name: OperationNameEnum.CREDENTIAL_STATUS_UPDATE_UNENCRYPTED,
					customer,
					user,
					data: {
						did,
						resource: result.resourceMetadata,
						encrypted: false,
						symmetricKey: '',
					},
				};

				eventTracker.emit('track', trackInfo);

				const statusRegistry = await this.findRegistryByUri(
					`${did}?resourceName=${result.resourceMetadata.resourceName}&resourceType=${result.resourceMetadata.resourceType}`,
					customer
				);

				if (statusRegistry) {
					await this.issuedCredentialRepository
						.update(
							{
								statusRegistry: statusRegistry,
								statusIndex: In(Array.isArray(indices) ? indices : [indices]),
							},
							{
								status:
									statusAction === 'revoke'
										? 'revoked'
										: statusAction === 'suspend'
											? 'suspended'
											: 'issued',
								updatedAt: new Date(),
							}
						)
						.catch(() => console.error('Failed to update issued credentials'));
				}
			}

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: formatted,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}

	async updateEncryptedStatusList(
		body: UpdateEncryptedStatusListRequestBody,
		query: UpdateUnencryptedStatusListRequestQuery,
		customer: CustomerEntity,
		user?: UserEntity
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: any;
		error?: string;
	}> {
		const {
			did,
			statusListName,
			statusListVersion,
			indices,
			symmetricKey,
			paymentConditions,
			feePaymentAddress,
			feePaymentAmount,
			feePaymentWindow,
		} = body;

		const { statusAction, listType } = query;

		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);
		try {
			const encrypted = await identityServiceStrategySetup.agent.searchStatusList(
				did,
				statusListName,
				listType,
				DefaultStatusActionPurposeMap[statusAction]
			);

			if (encrypted.error) {
				if (encrypted.error === 'notFound') {
					return {
						success: false,
						statusCode: StatusCodes.NOT_FOUND,
						error: `update: error: status list '${statusListName}' not found`,
					};
				}
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: `update: error: ${encrypted.error}`,
				};
			}

			if (!encrypted.resource?.metadata?.encrypted) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: `update: error: status list '${statusListName}' is unencrypted`,
				};
			}

			const result = (await identityServiceStrategySetup.agent.updateEncryptedStatusList(
				did,
				listType,
				{
					indices: typeof indices === 'number' ? [indices] : indices,
					statusListName,
					statusListVersion,
					statusAction,
					paymentConditions,
					symmetricKey,
					feePaymentAddress,
					feePaymentAmount,
					feePaymentWindow,
				},
				customer
			)) as (BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult) & {
				updated: boolean;
			};

			result.updated = (function (that) {
				if (
					(that as BulkRevocationResult)?.revoked?.every((item) => !!item) &&
					(that as BulkRevocationResult)?.revoked?.length !== 0
				)
					return true;

				if (
					(that as BulkSuspensionResult)?.suspended?.every((item) => !!item) &&
					(that as BulkSuspensionResult)?.suspended?.length !== 0
				)
					return true;

				if (
					(that as BulkUnsuspensionResult)?.unsuspended?.every((item) => !!item) &&
					(that as BulkUnsuspensionResult)?.unsuspended?.length !== 0
				)
					return true;

				return false;
			})(result);

			if (result.error) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: result.error?.message || result.error.toString(),
				};
			}

			const formatted = {
				updated: true,
				revoked: (result as BulkRevocationResult)?.revoked || undefined,
				suspended: (result as BulkSuspensionResult)?.suspended || undefined,
				unsuspended: (result as BulkUnsuspensionResult)?.unsuspended || undefined,
				resource: result.statusList,
				resourceMetadata: result.resourceMetadata,
				symmetricKey: result.symmetricKey,
			};

			if (result.resourceMetadata) {
				const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
					category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
					name: OperationNameEnum.CREDENTIAL_STATUS_UPDATE_ENCRYPTED,
					customer,
					user,
					data: {
						did,
						resource: result.resourceMetadata,
						encrypted: true,
						symmetricKey: '',
					},
					feePaymentOptions: [],
				};

				eventTracker.emit('track', trackInfo);

				const statusRegistry = await this.findRegistryByUri(
					`${did}?resourceName=${result.resourceMetadata.resourceName}&resourceType=${result.resourceMetadata.resourceType}`,
					customer
				);

				if (statusRegistry) {
					await this.issuedCredentialRepository
						.update(
							{
								statusRegistry: statusRegistry,
								statusIndex: In(Array.isArray(indices) ? indices : [indices]),
							},
							{
								status:
									statusAction === 'revoke'
										? 'revoked'
										: statusAction === 'suspend'
											? 'suspended'
											: 'issued',
								updatedAt: new Date(),
							}
						)
						.catch(() => console.error('Failed to update issued credentials'));
				}
			}

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: formatted,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}

	async checkStatusList(
		body: CheckStatusListRequestBody,
		query: CheckStatusListRequestQuery,
		customer: CustomerEntity,
		user?: UserEntity
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: any;
		error?: string;
	}> {
		const feePaymentOptions: IFeePaymentOptions[] = [];
		// collect request parameters - case: body
		const {
			did,
			statusListName,
			index,
			indices,
			indexRangeEnd,
			indexRangeStart,
			makeFeePayment,
			statusListCredential,
			statusSize,
			statusMessage,
		} = body;
		// collect request parameters - case: query
		const { statusPurpose, listType } = query;

		// Make the base body for tracking
		const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
			name: OperationNameEnum.CREDENTIAL_STATUS_CHECK,
			category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
			customer,
			user,
			successful: false,
			data: {
				did,
				registryId: '',
			},
		};
		if (listType === StatusListType.Bitstring) {
			if (!statusListCredential)
				return {
					statusCode: StatusCodes.BAD_REQUEST,
					success: false,
					error: `check: error: 'statusListCredential' is required for BitstringStatusList type`,
				};
			if (statusSize && statusSize > 2 && !statusMessage)
				return {
					statusCode: StatusCodes.BAD_REQUEST,
					success: false,
					error: `check: error: 'statusMessage' is required when 'statusSize' is greater than 1 for BitstringStatusList type`,
				};
		}

		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		const statusList = await identityServiceStrategySetup.agent.searchStatusList(
			did,
			statusListName,
			listType,
			statusPurpose
		);

		if (statusList.error) {
			if (statusList.error === 'notFound') {
				return {
					success: false,
					statusCode: StatusCodes.NOT_FOUND,
					error: `check: error: status list '${statusListName}' not found`,
				};
			}
			return {
				success: false,
				statusCode: StatusCodes.BAD_REQUEST,
				error: `check: error: ${statusList.error}`,
			};
		}

		try {
			// make fee payment, if defined
			if (makeFeePayment && statusList?.resource?.metadata?.encrypted) {
				const feePaymentResult = await Promise.all(
					statusList?.resource?.metadata?.paymentConditions?.map(
						async (condition: { feePaymentAddress: any; feePaymentAmount: any }) => {
							return await identityServiceStrategySetup.agent.remunerateStatusList2021(
								{
									feePaymentAddress: condition.feePaymentAddress,
									feePaymentAmount: condition.feePaymentAmount,
									feePaymentNetwork: toNetwork(did),
									memo: 'Automated status check fee payment, orchestrated by CaaS.',
								} satisfies FeePaymentOptions,
								customer
							);
						}
					) || []
				);

				// Track the operation
				await Promise.all(
					feePaymentResult.map(async (result) => {
						const portion = await FeeAnalyzer.getPaymentTrack(result, toNetwork(did));
						feePaymentOptions.push(...portion);
					})
				);

				// handle error
				if (feePaymentResult.some((result) => result.error)) {
					trackInfo.data = {
						did: did,
						resource: statusList.resourceMetadata,
						encrypted: statusList.resource?.metadata?.encrypted,
					} satisfies ICredentialStatusTrack;
					trackInfo.successful = false;
					trackInfo.feePaymentOptions = feePaymentOptions;

					eventTracker.emit('track', trackInfo);

					return {
						success: false,
						statusCode: StatusCodes.BAD_REQUEST,
						error: `check: payment: error: ${feePaymentResult.find((result) => result.error)?.error}`,
					};
				}
			}

			// check status list
			let result;
			let statusListUrl = statusListCredential?.startsWith('did:cheqd:')
				? `${process.env.RESOLVER_URL}${statusListCredential}`
				: statusListCredential;
			if (listType === StatusListType.Bitstring) {
				result = await identityServiceStrategySetup.agent.checkBitstringStatusList(
					did,
					{
						id: index ? statusListUrl + '#' + index : undefined,
						type: 'BitstringStatusListEntry',
						statusPurpose,
						statusListIndex: index?.toString(),
						statusListIndices: indices,
						statusListRangeStart: indexRangeStart,
						statusListRangeEnd: indexRangeEnd,
						statusListCredential: statusListUrl || '',
						statusSize: statusSize,
						statusMessage: statusMessage,
					} as CheqdCredentialStatus,
					customer
				);
			} else {
				result = await identityServiceStrategySetup.agent.checkStatusList2021(
					did,
					{
						statusListIndex: index!,
						statusListName,
						statusPurpose,
					},
					customer
				);
			}

			if ('error' in result && result.error) {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error:
						typeof result.error === 'string'
							? result.error
							: result.error.message || result.error.toString(),
				};
			}

			trackInfo.data = {
				did: did,
				resource: statusList.resourceMetadata,
				encrypted: statusList.resource?.metadata?.encrypted,
			} satisfies ICredentialStatusTrack;
			trackInfo.successful = true;
			trackInfo.feePaymentOptions = feePaymentOptions;

			eventTracker.emit('track', trackInfo);

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: result,
			};
		} catch (error) {
			const errorRef = error as Record<string, unknown>;

			if (errorRef?.errorCode === 'NodeAccessControlConditionsReturnedNotAuthorized') {
				return {
					success: false,
					statusCode: StatusCodes.UNAUTHORIZED,
					error: `check: error: ${
						errorRef?.message
							? 'unauthorized: decryption conditions are not met'
							: (error as Record<string, unknown>).toString()
					}`,
				};
			}

			if (errorRef?.errorCode === 'incorrect_access_control_conditions') {
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: `check: error: ${
						errorRef?.message
							? 'incorrect access control conditions'
							: (error as Record<string, unknown>).toString()
					}`,
				};
			}

			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${errorRef?.message || errorRef.toString()}`,
			};
		}
	}

	async searchStatusList(query: SearchStatusListQuery): Promise<{
		success: boolean;
		statusCode: number;
		data?: any;
		error?: string;
	}> {
		const { did, statusListName, listType, statusPurpose } = query;

		try {
			// find in registry and retreive uri
			const result = await new IdentityServiceStrategySetup().agent.searchStatusList(
				did,
				statusListName,
				listType,
				statusPurpose
			);

			if (result.error) {
				if (result.error === 'notFound') {
					return {
						success: false,
						statusCode: StatusCodes.NOT_FOUND,
						error: `search: error: status list '${statusListName}' not found`,
					};
				}
				return {
					success: false,
					statusCode: StatusCodes.BAD_REQUEST,
					error: `search: error: ${result.error}`,
				};
			}

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: result,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}

	/**
	 * Helper method to determine the next resource name in the registry chain
	 * Examples:
	 *   "test-list" -> "test-list-ext1"
	 *   "test-list-ext1" -> "test-list-ext2"
	 *   "test-list-ext5" -> "test-list-ext6"
	 */
	private getNextResourceName(currentRegistryName: string): string {
		// Check if already has extension
		const extMatch = currentRegistryName.match(/^(.+)-ext(\d+)$/);

		if (extMatch) {
			// Already has extension, increment it
			const baseName = extMatch[1];
			const currentExt = parseInt(extMatch[2], 10);
			return `${baseName}-ext${currentExt + 1}`;
		} else {
			// First extension
			return `${currentRegistryName}-ext1`;
		}
	}

	/**
	 * Update registry using CAS (Compare-And-Swap) pattern for optimistic locking
	 * @returns true if update succeeded, false if concurrent modification detected
	 */
	private async updateRegistryWithCAS(
		registryId: string,
		currentVersion: number,
		updates: Partial<StatusRegistryEntity>
	): Promise<boolean> {
		const result = await this.repository
			.createQueryBuilder()
			.update(StatusRegistryEntity)
			.set({
				...updates,
				version: currentVersion + 1,
				updatedAt: new Date(),
			})
			.where('registryId = :registryId', { registryId })
			.andWhere('version = :version', { version: currentVersion })
			.execute();

		return (result.affected ?? 0) === 1;
	}

	/**
	 * Find registry by URI
	 */
	private async findRegistryByUri(uri: string, customer: CustomerEntity): Promise<StatusRegistryEntity | null> {
		return await this.repository.findOne({
			where: {
				uri,
				customer,
			},
			relations: ['identifier'],
		});
	}

	/**
	 * Create STANDBY registry linked to the active registry
	 */
	private async createStandbyRegistry(activeRegistry: StatusRegistryEntity, customer: CustomerEntity): Promise<void> {
		const nextResourceName = this.getNextResourceName(activeRegistry.registryName);
		const nextUri = `${activeRegistry.identifier.did}?resourceName=${nextResourceName}&resourceType=${activeRegistry.registryType}`;

		// Create new STANDBY registry
		const newRegistryRequestBody = {
			...activeRegistry.metadata,
			encoding: activeRegistry.metadata?.encoding,
			did: activeRegistry.identifier.did,
			statusListName: nextResourceName,
			statusListVersion: '1',
			length: activeRegistry.registrySize,
			state: StatusRegistryState.Standby,
			credentialCategory: activeRegistry.credentialCategory,
			prev_uri: activeRegistry.uri,
		};

		const newRegistryQuery = {
			listType: activeRegistry.registryType,
			statusPurpose: activeRegistry.metadata?.statusPurpose as
				| DefaultStatusList2021StatusPurposeType
				| BitstringStatusListPurposeType,
		};

		const res = activeRegistry.encrypted
			? await this.createEncryptedStatusList(newRegistryRequestBody, newRegistryQuery, customer)
			: await this.createUnencryptedStatusList(newRegistryRequestBody, newRegistryQuery, customer);

		if (res.error) {
			throw new Error(`Failed to create STANDBY registry: ${res.error}`);
		}

		// Update current registry with next_uri using CAS
		const updated = await this.updateRegistryWithCAS(activeRegistry.registryId, activeRegistry.version, {
			next_uri: nextUri,
		});

		if (!updated) {
			throw new Error('Failed to update next_uri - concurrent modification detected');
		}
	}

	/**
	 * Rotate status list based on capacity threshold
	 * This function handles:
	 * 1. Creating STANDBY when threshold is reached
	 * 2. Promoting STANDBY to ACTIVE when registry is FULL
	 * 3. Marking current registry as FULL
	 */
	async rotateStatusList(statusListId: string, customer: CustomerEntity) {
		// Find existing registry
		const registry = await this.repository.findOne({
			where: {
				registryId: statusListId,
				customer,
			},
			relations: ['identifier'],
		});

		if (!registry) {
			throw new Error('Registry not found');
		}

		// Calculate utilization
		const utilizationPercent = (registry.writeCursor / registry.registrySize) * 100;
		const isFull = registry.writeCursor >= registry.registrySize;
		const isAtThreshold = utilizationPercent >= registry.threshold_percentage;

		if (isFull) {
			// Registry is FULL - promote STANDBY to ACTIVE
			await this.handleFullRegistry(registry, customer);
		} else if (isAtThreshold) {
			// Threshold reached - create STANDBY if not exists
			await this.handleThresholdReached(registry, customer);
		} else {
			throw new Error(
				`Registry is not at threshold (${utilizationPercent.toFixed(2)}% < ${registry.threshold_percentage}%)`
			);
		}
	}

	/**
	 * Handle registry that has reached threshold
	 * Creates STANDBY if one doesn't exist
	 */
	private async handleThresholdReached(registry: StatusRegistryEntity, customer: CustomerEntity): Promise<void> {
		// Check if STANDBY already exists
		if (registry.next_uri) {
			// STANDBY already exists, nothing to do
			console.log(`STANDBY already exists for registry ${registry.registryId}`);
			return;
		}

		// Create STANDBY registry
		await this.createStandbyRegistry(registry, customer);
	}

	/**
	 * Handle registry that is FULL
	 * Promotes STANDBY to ACTIVE and creates new STANDBY
	 */
	private async handleFullRegistry(registry: StatusRegistryEntity, customer: CustomerEntity): Promise<void> {
		// Check if next_uri exists (STANDBY)
		if (!registry.next_uri) {
			throw new Error('Registry is FULL but no STANDBY exists. Create STANDBY first.');
		}

		// Mark current as FULL using CAS
		const markedFull = await this.updateRegistryWithCAS(registry.registryId, registry.version, {
			state: StatusRegistryState.Full,
			sealedAt: new Date(), // TODO include sealed commitment
		});

		if (!markedFull) {
			throw new Error('Failed to mark registry as FULL - concurrent modification detected');
		}

		// Find STANDBY registry by next_uri
		const standbyRegistry = await this.findRegistryByUri(registry.next_uri, customer);

		if (!standbyRegistry) {
			throw new Error('STANDBY registry not found at next_uri');
		}

		// Promote STANDBY to ACTIVE using CAS
		const promoted = await this.updateRegistryWithCAS(standbyRegistry.registryId, standbyRegistry.version, {
			state: StatusRegistryState.Active,
		});

		if (!promoted) {
			throw new Error('Failed to promote STANDBY to ACTIVE - concurrent modification detected');
		}

		// Create new STANDBY for the newly promoted ACTIVE registry
		await this.createStandbyRegistry(standbyRegistry, customer);
	}

	async listStatusList(
		query: ListStatusListQuery,
		customer: CustomerEntity
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: { records: StatusListRecord[]; total: number };
		error?: string;
	}> {
		const { deprecated, did, state, statusListName, listType, credentialCategory } = query;

		try {
			const where: FindOptionsWhere<StatusRegistryEntity> = {
				customer: { customerId: customer.customerId },
			};
			const relations: FindOptionsRelations<StatusRegistryEntity> = {
				identifier: true, // Check performance for this JOIN operation
			};
			if (deprecated) {
				where.deprecated = deprecated;
			}

			if (did) {
				where.identifier = { did };
			}

			if (state) {
				where.state = state;
			}

			if (listType) {
				if (listType === StatusListType.Bitstring) {
					where.registryType = Like('%Bitstring%');
				} else {
					where.registryType = Like('%StatusList2021%');
				}
			}

			if (statusListName) {
				where.registryName = statusListName;
			}

			if (credentialCategory) {
				where.credentialCategory = credentialCategory;
			}

			const [data, count] = await this.repository.findAndCount({ where, relations });

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: {
					records: data.map((item) => ({
						statusListId: item.registryId,
						statusListName: item.registryName,
						uri: item.uri,
						issuerId: item.identifier.did,
						previousUri: item.prev_uri,
						nextUri: item.next_uri,
						listType: item.registryType,
						storageType: item.storageType,
						encrypted: item.encrypted || false,
						credentialCategory: item.credentialCategory,
						size: item.registrySize,
						writeCursor: item.writeCursor,
						state: item.state,
						createdAt: item.createdAt.toISOString(),
						updatedAt: item.updatedAt.toISOString(),
						sealedAt: item.sealedAt ? item.sealedAt.toISOString() : undefined,
						statusPurpose: item.metadata?.statusPurpose,
						deprecated: item.deprecated,
					})),
					total: count,
				},
			};
		} catch (error) {
			return {
				success: false,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}

	async getStatusList(
		statusOptions: {
			statusListId?: string;
			statusListName?: string;
			listType?: StatusListType;
		},
		customer: CustomerEntity,
		lock: boolean = false
	): Promise<{
		success: boolean;
		statusCode: number;
		data?: StatusListRecord;
		error?: string;
	}> {
		const where: FindOptionsWhere<StatusRegistryEntity> = {
			customer: { customerId: customer.customerId },
		};
		if (statusOptions.statusListId) {
			where.registryId = statusOptions.statusListId;
		} else if (statusOptions.statusListName && statusOptions.listType) {
			where.registryName = statusOptions.statusListName!;
			where.registryType = statusOptions.listType!;
		} else {
			return {
				success: false,
				statusCode: StatusCodes.BAD_REQUEST,
				error: 'Either statusListId or statusListName and listType must be provided',
			};
		}
		try {
			const item = await this.repository.findOne({
				where,
				relations: ['identifier'],
				lock: lock ? { mode: 'pessimistic_write' } : undefined,
			});
			if (!item) {
				return {
					success: false,
					statusCode: StatusCodes.NOT_FOUND,
					error: `Status list not found`,
				};
			}

			return {
				success: true,
				statusCode: StatusCodes.OK,
				data: {
					statusListId: item.registryId,
					statusListName: item.registryName,
					uri: item.uri,
					issuerId: item.identifier.did,
					previousUri: item.prev_uri,
					nextUri: item.next_uri,
					listType: item.registryType,
					storageType: item.storageType,
					encrypted: item.encrypted || false,
					credentialCategory: item.credentialCategory,
					size: item.registrySize,
					writeCursor: item.writeCursor,
					state: item.state,
					createdAt: item.createdAt.toISOString(),
					updatedAt: item.updatedAt.toISOString(),
					sealedAt: item.sealedAt ? item.sealedAt.toISOString() : undefined,
					deprecated: item.deprecated,
					statusPurpose: item.metadata?.statusPurpose,
					additionalUsedIndexes: item.metadata?.additionalUsedIndexes || [],
				},
			};
		} catch (error) {
			throw new Error(`Internal error: ${(error as Record<string, unknown>)?.message || error}`);
		}
	}
}
