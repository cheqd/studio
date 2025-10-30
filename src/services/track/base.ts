import type { ITrackOperation, INotifyMessage, ITrackResult, TrackData } from '../../types/track.js';
import type { IObserver } from './types.js';

export class BaseOperationObserver implements IObserver {
	private emitter: EventEmitter;

	constructor(emitter: EventEmitter) {
		this.emitter = emitter;
	}

	async update(trackOperation: ITrackOperation<TrackData>): Promise<void> {
		throw new Error('Method not implemented.');
	}

	notify(notifyMessage: INotifyMessage): void {
		this.emitter.emit('notify', notifyMessage);
	}

	public compileMessage(trackResult: ITrackResult): string {
		// Format is: Date | Category | Operation | Customer | <possibly user> |  <possibly did> | <possibly message> or Success/Error |
		const date = new Date();
		const components = [
			date.toISOString(),
			trackResult.operation.category,
			trackResult.operation.name,
			trackResult.operation.customer ? `CustomerId: ${trackResult.operation.customer.customerId}` : '',
			trackResult.operation.user ? `UserId: ${trackResult.operation.user.logToId}` : '',
			trackResult.error ? 'Error: ' + trackResult.error : 'Success',
		];
		return components.join(' | ');
	}
}
