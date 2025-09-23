import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
import { OperationNameEnum, OperationCategoryNameEnum } from '../../../types/constants.js';
import type {
	ICredentialStatusTrack,
	ICredentialTrack,
	IResourceTrack,
	ITrackOperation,
	ITrackResult,
} from '../../../types/track.js';
import { isCredentialStatusTrack, isCredentialTrack, isResourceTrack } from '../helpers.js';
import { IdentifierService } from '../../api/identifier.js';
import { KeyService } from '../../api/key.js';
import { ResourceService } from '../../api/resource.js';
import type { IObserver } from '../types.js';
import { BaseOperationObserver } from '../base.js';
import { parseCheqdDid } from '../../../helpers/helpers.js';

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
		// tracking resource creation in database
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

		const identifier = await IdentifierService.instance.get(did, customer);
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
			symmetricKey,
			parseCheqdDid(did).network
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
