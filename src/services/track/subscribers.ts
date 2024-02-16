import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
import { OperationNameEnum, OperationCategoryNameEnum, OperationDefaultFeeEnum } from '../../types/constants.js';
import {
	type ICredentialStatusTrack,
	type ICredentialTrack,
	type IPresentationTrack,
	type IResourceTrack,
	type IKeyTrack,
	type ITrackOperation,
	type ITrackResult,
	type IDIDTrack,
	TrackOperationWithPayment,
} from '../../types/track.js';
import { isCredentialStatusTrack, isCredentialTrack, isResourceTrack } from './helpers.js';
import { IdentifierService } from '../identifier.js';
import { KeyService } from '../key.js';
import { OperationService } from '../operation.js';
import { ResourceService } from '../resource.js';
import type { IObserver } from './types.js';
import { BaseOperationObserver } from './base.js';
import type { LogLevelDesc } from 'loglevel';
import type { OperationEntity } from '../../database/entities/operation.entity.js';
import { PaymentService } from '../payment.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';

export class DBOperationSubscriber extends BaseOperationObserver implements IObserver {
	protected logSeverity: LogLevelDesc = 'debug';

	async update(trackOperation: ITrackOperation): Promise<void> {
		// tracking operation in our DB. It handles all the operations
		const result = await this.trackOperation(trackOperation);
		const message = result.error
			? `Error while writing information about operation ${trackOperation.name} to DB: ${result.error}`
			: `Information about operation ${trackOperation.name} was successfully written to DB`;
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: message,
			severity: result.error ? 'error' : this.logSeverity,
		});
	}

	async trackPayments(
		operationWithPayment: TrackOperationWithPayment,
		operationEntity: OperationEntity
	): Promise<ITrackResult> {
		const resource = await operationWithPayment.getResourceEntity();
		if (!resource) {
			return {
				operation: operationWithPayment,
				error: `Resource for operation ${operationWithPayment.name} not found. Customer: ${operationWithPayment.customer.customerId}`,
			} satisfies ITrackResult;
		}

		for (const feePayment of operationWithPayment.feePaymentOptions) {
			const payment = await PaymentService.instance.create(
				feePayment.txHash as string,
				operationWithPayment.customer as CustomerEntity,
				operationEntity,
				feePayment.fee,
				feePayment.amount,
				feePayment.successful,
				feePayment.network,
				resource,
				feePayment.fromAddress,
				feePayment.toAddress,
				feePayment.timestamp
			);
			if (!payment) {
				return {
					operation: operationWithPayment,
					error: `Payment for operation ${operationWithPayment.name} was not written to DB`,
				} satisfies ITrackResult;
			}
		}
		return {
			operation: operationWithPayment,
			error: '',
		} satisfies ITrackResult;
	}

	async getDefaultFee(operation: string, resourceId?: string): Promise<number> {
		const defaultFee = 0;
		switch (operation) {
			case OperationNameEnum.DID_CREATE:
				return OperationDefaultFeeEnum.DID_CREATE;
			case OperationNameEnum.DID_UPDATE:
				return OperationDefaultFeeEnum.DID_UPDATE;
			case OperationNameEnum.DID_DEACTIVATE:
				return OperationDefaultFeeEnum.DID_DEACTIVATE;
		}
		if (
			operation === OperationNameEnum.RESOURCE_CREATE ||
			operation === OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED ||
			operation === OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED ||
			operation === OperationNameEnum.CREDENTIAL_STATUS_UPDATE_ENCRYPTED ||
			operation === OperationNameEnum.CREDENTIAL_STATUS_UPDATE_UNENCRYPTED
		) {
			if (!resourceId) {
				return defaultFee;
			}
			const entity = await ResourceService.instance.get(resourceId);
			if (!entity) {
				return defaultFee;
			}
			if (entity.mediaType === 'application/json') {
				return OperationDefaultFeeEnum.RESOURCE_CREATE_JSON;
			}
			if (entity.mediaType.includes('image')) {
				return OperationDefaultFeeEnum.RESOURCE_CREATE_IMAGE;
			}
			return OperationDefaultFeeEnum.RESOURCE_CREATE_OTHER;
		}
		return defaultFee;
	}

	async trackOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		try {
			let resourceId = undefined;
			if (trackOperation.data && (trackOperation.data as IResourceTrack).resource) {
				resourceId = (trackOperation.data as IResourceTrack).resource.resourceId;
			}
			// Create operation entity
			const operationEntity = await OperationService.instance.create(
				trackOperation.category,
				trackOperation.name,
				await this.getDefaultFee(trackOperation.name, resourceId),
				false,
				trackOperation.successful
			);

			if (!operationEntity) {
				throw new Error(`Operation ${trackOperation.name} was not written to DB`);
			}

			// Track payments
			if (trackOperation.feePaymentOptions) {
				const operationWithPayment = new TrackOperationWithPayment(trackOperation);
				const paymentValidation = operationWithPayment.validate();
				if (paymentValidation.error) {
					return {
						operation: trackOperation,
						error: `Error while validating payment options: ${paymentValidation.error}`,
					} satisfies ITrackResult;
				}
				return await this.trackPayments(operationWithPayment, operationEntity);
			}

			return {
				operation: trackOperation,
				error: '',
			} satisfies ITrackResult;
		} catch (error) {
			return {
				operation: trackOperation,
				error: `Error while writing information about operation ${trackOperation.name} to DB: ${(error as Error)?.message || error}`,
			} satisfies ITrackResult;
		}
	}
}

export class ResourceSubscriber extends BaseOperationObserver implements IObserver {
	private static acceptedOperations = [
		OperationNameEnum.RESOURCE_CREATE,
		OperationNameEnum.CREDENTIAL_REVOKE,
		OperationNameEnum.CREDENTIAL_SUSPEND,
		OperationNameEnum.CREDENTIAL_UNSUSPEND,
		OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED,
		OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED,
		OperationNameEnum.CREDENTIAL_STATUS_UPDATE_UNENCRYPTED,
		OperationNameEnum.CREDENTIAL_STATUS_UPDATE_ENCRYPTED,
	];

	isReactionNeeded(trackOperation: ITrackOperation): boolean {
		// Resource tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		const isCategoryAccepted =
			trackOperation.category === OperationCategoryNameEnum.RESOURCE ||
			trackOperation.category === OperationCategoryNameEnum.CREDENTIAL ||
			trackOperation.category === OperationCategoryNameEnum.CREDENTIAL_STATUS;
		const isOperationAccepted = ResourceSubscriber.acceptedOperations.includes(
			trackOperation.name as OperationNameEnum
		);
		return isCategoryAccepted && isOperationAccepted;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as IResourceTrack;
		return `${base_message} | Resource DID: ${data.did} | ResourceName: ${data.resource.resourceName} | ResourceType: ${data.resource.resourceType} | ResourceId: ${data.resource.resourceId}`;
	}

	async update(trackOperation: ITrackOperation): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		trackOperation.category = OperationCategoryNameEnum.RESOURCE;
		trackOperation.name = OperationNameEnum.RESOURCE_CREATE;
		// tracking resource creation in DB
		const result = await this.trackResourceOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackResourceOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		// Resource operation may be with CredentialStatusList or with Credential operations like revocation
		// and others and also with Resource operations like create, update, delete
		const customer = trackOperation.customer;
		const data = trackOperation.data as IResourceTrack | ICredentialStatusTrack | ICredentialTrack;
		const did = data.did;
		let encrypted = false;
		let symmetricKey = '';
		let resource: LinkedResourceMetadataResolutionResult | undefined = undefined;

		if (!customer) {
			return {
				operation: trackOperation,
				error: `Customer for resource operation was not specified`,
			};
		}

		if (isResourceTrack(data)) {
			encrypted = false;
			symmetricKey = '';
			resource = (data as IResourceTrack).resource;
		}
		if (isCredentialStatusTrack(data)) {
			encrypted = (data as ICredentialStatusTrack).encrypted || false;
			symmetricKey = (data as ICredentialStatusTrack).symmetricKey || '';
			resource = (data as ICredentialStatusTrack).resource;
		}
		if (isCredentialTrack(data)) {
			encrypted = (data as ICredentialTrack).encrypted || false;
			symmetricKey = (data as ICredentialTrack).symmetricKey || '';
			resource = (data as ICredentialTrack).resource;
		}

		if (!resource) {
			return {
				operation: trackOperation,
				error: `Resource for ${did} was not specified`,
			};
		}

		const identifier = await IdentifierService.instance.get(did);
		if (!identifier) {
			throw new Error(`Identifier ${did} not found`);
		}
		if (!identifier.controllerKeyId) {
			throw new Error(`Identifier ${did} does not have link to the controller key...`);
		}
		const key = await KeyService.instance.get(identifier.controllerKeyId);
		if (!key) {
			throw new Error(`Key for ${did} not found`);
		}

		const resourceEntity = await ResourceService.instance.createFromLinkedResource(
			resource,
			customer,
			key,
			identifier,
			encrypted,
			symmetricKey
		);
		if (!resourceEntity) {
			return {
				operation: trackOperation,
				error: `Resource for ${did} was not tracked`,
			};
		}
		return {
			operation: trackOperation,
			error: '',
		};
	}
}

export class CredentialSubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation): boolean {
		// Credential tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		return trackOperation.category === OperationCategoryNameEnum.CREDENTIAL;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as ICredentialTrack;
		return `${base_message} | Credential holder: ${data.did}`;
	}

	async update(trackOperation: ITrackOperation): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in DB
		const result = await this.trackCredentialOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackCredentialOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		// We don't have specific credential writes, so we just track credential creation
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}

export class DIDSubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation): boolean {
		return trackOperation.category === OperationCategoryNameEnum.DID;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as IDIDTrack;
		return `${base_message} | Target DID: ${data.did}`;
	}

	async update(trackOperation: ITrackOperation): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in DB
		const result = await this.trackDIDOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackDIDOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		// We don't have specific DID related operations to track
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}

export class CredentialStatusSubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation): boolean {
		// Credential tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		return trackOperation.category === OperationCategoryNameEnum.CREDENTIAL_STATUS;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as ICredentialStatusTrack;
		return `${base_message} | Target DID: ${data.did} | Encrypted: ${data.encrypted} | StatusListName: ${data.resource?.resourceName}`;
	}

	async update(trackOperation: ITrackOperation): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in DB
		const result = await this.trackCredentialStatusOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackCredentialStatusOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		// We don't have specific credential status writes, so we just track credential creation
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}

export class PresentationSubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation): boolean {
		// Credential tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		return trackOperation.category === OperationCategoryNameEnum.PRESENTATION;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as IPresentationTrack;
		return `${base_message} | Presentation holder: ${data.holder}`;
	}

	async update(trackOperation: ITrackOperation): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in DB
		const result = await this.trackPresentationOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackPresentationOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		// We don't have specific presentation writes, so we just track presentation creation
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}

export class KeySubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation): boolean {
		// Credential tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		return trackOperation.category === OperationCategoryNameEnum.KEY;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as IKeyTrack;
		return `${base_message} | keyRef: ${data.keyRef} | keyType: ${data.keyType}`;
	}

	async update(trackOperation: ITrackOperation): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in DB
		const result = await this.trackKeyOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackKeyOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		// We don't have specific presentation writes, so we just track presentation creation
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}
