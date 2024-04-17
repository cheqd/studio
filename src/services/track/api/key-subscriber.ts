import { OperationCategoryNameEnum } from '../../../types/constants.js';
import type { IKeyTrack, ITrackOperation, ITrackResult } from '../../../types/track.js';
import type { IObserver } from '../types.js';
import { BaseOperationObserver } from '../base.js';

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
		// tracking resource creation in database
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
