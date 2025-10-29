import { fromString } from 'uint8arrays';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import type {
	CreateEncryptedBitstringSuccessfulResponseBody,
	CreateUnencryptedBitstringSuccessfulResponseBody,
	FeePaymentOptions,
} from '../../types/credential-status.js';
import { DefaultStatusActionPurposeMap, StatusListType } from '../../types/credential-status.js';
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
} from '@cheqd/did-provider-cheqd';
import { toNetwork } from '../../helpers/helpers.js';
import { eventTracker } from '../track/tracker.js';
import type { ICredentialStatusTrack, ITrackOperation, IFeePaymentOptions } from '../../types/track.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { FeeAnalyzer } from '../../helpers/fee-analyzer.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import { Repository } from 'typeorm';
import { StatusRegistryEntity } from '../../database/entities/status-registry.entity.js';
import { Connection } from '../../database/connection/connection.js';
import { v4 } from 'uuid';

export class CredentialStatusService {
	public static instance = new CredentialStatusService();
	public repository: Repository<StatusRegistryEntity>;

	constructor() {
		this.repository = Connection.instance.dbConnection.getRepository(StatusRegistryEntity);
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
			statusListVersion,
			length,
			encoding,
			statusSize: size,
			ttl,
			statusMessages,
			state,
		} = body;

		const { listType, statusPurpose } = query;

		const data = encodedList ? fromString(encodedList, encoding) : undefined;
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			if (data) {
				let result;
				if (listType === StatusListType.Bitstring) {
					result = await identityServiceStrategySetup.agent.broadcastBitstringStatusList(
						did,
						{ data, name: statusListName, alsoKnownAs, version: statusListVersion },
						customer
					);
				} else {
					result = await identityServiceStrategySetup.agent.broadcastStatusList2021(
						did,
						{ data, name: statusListName, alsoKnownAs, version: statusListVersion },
						{ encoding, statusPurpose: statusPurpose as DefaultStatusList2021StatusPurposeType },
						customer
					);
				}
				return {
					success: result,
					statusCode: 200,
					data,
				};
			}

			let result:
				| CreateUnencryptedStatusListSuccessfulResponseBody
				| CreateUnencryptedBitstringSuccessfulResponseBody;

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
			}

			if (result.error) {
				return {
					success: false,
					statusCode: 400,
					error: result.error?.message || result.error.toString(),
				};
			}

			const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
				category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
				name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED,
				customer,
				user,
				data: {
					did,
					resource: result.resourceMetadata,
					encrypted: result.resource?.metadata?.encrypted,
					symmetricKey: '',
				},
			};

			await this.repository.save({
				registryId: v4(),
				state: state || 'ACTIVE',
				statusPurpose: statusPurpose,
				storageType: 'cheqd',
				registryType: listType,
				registryName: statusListName,
				version: statusListVersion || '1.0',
				uri: `${did}?resourceName=${result.resourceMetadata.resourceName}&resourceType=${result.resourceMetadata.resourceType}`,
				issuerId: did,
				size: 10,
				lastAssignedIndex: 0,
			});

			eventTracker.emit('track', trackInfo);

			return {
				success: true,
				statusCode: 200,
				data: result,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: 500,
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
			statusListVersion,
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
		} = body;

		const { listType, statusPurpose } = query;
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		try {
			let result:
				| CreateEncryptedStatusListSuccessfulResponseBody
				| CreateEncryptedBitstringSuccessfulResponseBody;

			if (listType === StatusListType.Bitstring) {
				result = (await identityServiceStrategySetup.agent.createEncryptedBitstringStatusList(
					did,
					{
						name: `${statusListName}-${statusListVersion}`, // to make it unique
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
			}

			if (result.error) {
				return {
					success: false,
					statusCode: 400,
					error: result.error?.message || result.error.toString(),
				};
			}

			const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
				name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED,
				category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
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

			await this.repository.save({
				registryId: v4(),
				state: state || 'ACTIVE',
				statusPurpose: statusPurpose,
				storageType: 'cheqd',
				registryType: listType,
				registryName: statusListName,
				version: statusListVersion || '1.0',
				uri: `${did}?resourceName=${result.resourceMetadata.resourceName}&resourceType=${result.resourceMetadata.resourceType}`,
				issuerId: did,
				size: 10,
				lastAssignedIndex: 0,
			});

			eventTracker.emit('track', trackInfo);

			return {
				success: true,
				statusCode: 200,
				data: result,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: 500,
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
		const { did, statusListName, statusListVersion, indices } = body;
		const { statusAction, listType } = query;

		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

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
					statusCode: 404,
					error: `update: error: status list '${statusListName}' not found`,
				};
			}
			return {
				success: false,
				statusCode: 400,
				error: `update: error: ${unencrypted.error}`,
			};
		}

		if (unencrypted.resource?.metadata?.encrypted) {
			return {
				success: false,
				statusCode: 400,
				error: `update: error: status list '${statusListName}' is encrypted`,
			};
		}

		try {
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
					statusCode: 400,
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
			}

			return {
				success: true,
				statusCode: 200,
				data: formatted,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: 500,
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
					statusCode: 404,
					error: `update: error: status list '${statusListName}' not found`,
				};
			}
			return {
				success: false,
				statusCode: 400,
				error: `update: error: ${encrypted.error}`,
			};
		}

		if (!encrypted.resource?.metadata?.encrypted) {
			return {
				success: false,
				statusCode: 400,
				error: `update: error: status list '${statusListName}' is unencrypted`,
			};
		}

		try {
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
					statusCode: 400,
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
			}

			return {
				success: true,
				statusCode: 200,
				data: formatted,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: 500,
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
		const { did, statusListName, index, makeFeePayment } = body;
		const { statusPurpose } = query;

		const trackInfo: ITrackOperation<ICredentialStatusTrack> = {
			name: OperationNameEnum.CREDENTIAL_STATUS_CHECK,
			category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
			customer,
			user,
			successful: false,
			data: {
				did,
				statusListName,
				statusListType: statusPurpose,
			},
		};

		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		const statusList = await identityServiceStrategySetup.agent.searchStatusList(
			did,
			statusListName,
			StatusListType.StatusList2021,
			statusPurpose
		);

		if (statusList.error) {
			if (statusList.error === 'notFound') {
				return {
					success: false,
					statusCode: 404,
					error: `check: error: status list '${statusListName}' not found`,
				};
			}
			return {
				success: false,
				statusCode: 400,
				error: `check: error: ${statusList.error}`,
			};
		}

		try {
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

				await Promise.all(
					feePaymentResult.map(async (result) => {
						const portion = await FeeAnalyzer.getPaymentTrack(result, toNetwork(did));
						feePaymentOptions.push(...portion);
					})
				);

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
						statusCode: 400,
						error: `check: payment: error: ${feePaymentResult.find((result) => result.error)?.error}`,
					};
				}
			}

			const result = await identityServiceStrategySetup.agent.checkStatusList2021(
				did,
				{
					statusListIndex: index,
					statusListName,
					statusPurpose,
				},
				customer
			);

			if (result.error) {
				return {
					success: false,
					statusCode: 400,
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
				statusCode: 200,
				data: result,
			};
		} catch (error) {
			const errorRef = error as Record<string, unknown>;

			if (errorRef?.errorCode === 'NodeAccessControlConditionsReturnedNotAuthorized') {
				return {
					success: false,
					statusCode: 401,
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
					statusCode: 400,
					error: `check: error: ${
						errorRef?.message
							? 'incorrect access control conditions'
							: (error as Record<string, unknown>).toString()
					}`,
				};
			}

			return {
				success: false,
				statusCode: 500,
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
						statusCode: 404,
						error: `search: error: status list '${statusListName}' not found`,
					};
				}
				return {
					success: false,
					statusCode: 400,
					error: `search: error: ${result.error}`,
				};
			}

			return {
				success: true,
				statusCode: 200,
				data: result,
			};
		} catch (error) {
			return {
				success: false,
				statusCode: 500,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			};
		}
	}
}
