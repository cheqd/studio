import { OperationCategoryNameEnum, OperationNameEnum } from '../../../types/constants.js';
import type { ICredentialStatusTrack, ITrackOperation, ITrackResult, TrackData } from '../../../types/track.js';
import type { IObserver } from '../types.js';
import { BaseOperationObserver } from '../base.js';
import { CredentialStatusService } from '../../api/credential-status.js';

export class CredentialStatusSubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation<TrackData>): boolean {
		// Credential tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		return trackOperation.category === OperationCategoryNameEnum.CREDENTIAL_STATUS;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as ICredentialStatusTrack;
		return `${base_message} | Target DID: ${data.did} | Encrypted: ${data.encrypted} | StatusListName: ${data.resource?.resourceName}`;
	}

	async update(trackOperation: ITrackOperation<ICredentialStatusTrack>): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in database
		const result = await this.trackCredentialStatusOperation(trackOperation);

		// if credential status is full, activate the standby registry and create a new registry for standby
		if (
			trackOperation.name === OperationNameEnum.CREDENTIAL_STATUS_FULL ||
			trackOperation.name === OperationNameEnum.CREDENTIAL_STATUS_THRESHOLD_REACHED
		) {
			// Promote the current standby to active

			// Rotate the status list
			if (trackOperation.data.registryId) {
				await CredentialStatusService.instance.rotateStatusList(
					trackOperation.data.registryId,
					trackOperation.customer
				);
			}
		}

		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackCredentialStatusOperation(
		trackOperation: ITrackOperation<ICredentialStatusTrack>
	): Promise<ITrackResult> {
		// We don't have specific credential status writes, so we just track credential creation
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}
