import type { ITrackResult } from '../../types/track';
import type { IObserver } from './observer';

export class BaseNotifier implements IObserver {
	public async update(trackResult: ITrackResult): Promise<ITrackResult> {
		throw new Error('Method not implemented.');
	}

	public compileMessage(trackResult: ITrackResult): string {
		const date = new Date();
		// Format is: Data | Category | Operation | Customer | <possibly user> |  <possibly did> | <possibly message> | Success/Error
		const logLine = ` ${date.toISOString()} | ${trackResult.operation.category} | ${trackResult.operation.name} | ${trackResult.operation.customer.customerId}`;
		if (trackResult.operation.user) {
			logLine.concat(` | ${trackResult.operation.user.logToId}`);
		}
		if (trackResult.operation.did) {
			logLine.concat(` | ${trackResult.operation.did}`);
		}
		if (trackResult.message) {
			logLine.concat(` | Message: ${trackResult.message}`);
		} else {
			logLine.concat(
				` | ${trackResult.error ? 'Error: ' + trackResult.error : 'Success: ' + trackResult.operation.name}`
			);
		}
		return logLine;
	}
}

export class LoggerNotifier extends BaseNotifier implements IObserver {
	readonly severity: string;

	constructor(severity?: string) {
		super();
		this.severity = severity || 'info';
	}

	public async update(trackResult: ITrackResult): Promise<ITrackResult> {
		const logString = this.compileMessage(trackResult);
		if (trackResult.error) {
			console.error(logString);
		} else {
			switch (this.severity) {
				case 'info':
					console.info(logString);
					break;
				case 'warn':
					console.warn(logString);
					break;
				case 'debug':
					console.debug(logString);
					break;
				default:
					console.log(logString);
			}
		}
		return {
			tracked: true,
			operation: trackResult.operation,
		};
	}
}

export class DatadogNotifier extends BaseNotifier implements IObserver {
	public async update(trackResult: ITrackResult): Promise<ITrackResult> {
		// Make actions for sending info to Datadog
		return {
			tracked: true,
			operation: trackResult.operation,
		};
	}
}
