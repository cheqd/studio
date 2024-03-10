import { OperationCategoryNameEnum } from '../../../types/constants.js';
import type { IPresentationTrack, ITrackOperation, ITrackResult } from '../../../types/track.js';
import type { IObserver } from '../types.js';
import { BaseOperationObserver } from '../base.js';

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
