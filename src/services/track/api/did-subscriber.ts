import { OperationCategoryNameEnum } from '../../../types/constants.js';
import type { ITrackOperation, ITrackResult, IDIDTrack } from '../../../types/track.js';
import type { IObserver } from '../types.js';
import { BaseOperationObserver } from '../base.js';

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
		// tracking resource creation in database
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
