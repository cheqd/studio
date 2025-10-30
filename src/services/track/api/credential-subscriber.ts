import { OperationCategoryNameEnum } from '../../../types/constants.js';
import type { ICredentialTrack, ITrackOperation, ITrackResult, TrackData } from '../../../types/track.js';
import type { IObserver } from '../types.js';
import { BaseOperationObserver } from '../base.js';

export class CredentialSubscriber extends BaseOperationObserver implements IObserver {
	isReactionNeeded(trackOperation: ITrackOperation<TrackData>): boolean {
		// Credential tracker reacts on CredentialStatusList, Credential operations like revocation
		// and Resource operations like create, update, delete
		return trackOperation.category === OperationCategoryNameEnum.CREDENTIAL;
	}

	public compileMessage(trackResult: ITrackResult): string {
		const base_message = super.compileMessage(trackResult);
		const data = trackResult.operation.data as ICredentialTrack;
		return `${base_message} | Credential holder: ${data.did}`;
	}

	async update(trackOperation: ITrackOperation<ICredentialTrack>): Promise<void> {
		if (!this.isReactionNeeded(trackOperation)) {
			// Just skip this operation
			return;
		}
		// tracking resource creation in database
		const result = await this.trackCredentialOperation(trackOperation);
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: this.compileMessage(result),
			severity: result.error ? 'error' : 'info',
		});
	}

	async trackCredentialOperation(trackOperation: ITrackOperation<ICredentialTrack>): Promise<ITrackResult> {
		// We don't have specific credential writes, so we just track credential creation
		return {
			operation: trackOperation,
			error: '',
		} satisfies ITrackResult;
	}
}
