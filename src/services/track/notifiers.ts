import { LOG_LEVEL } from '../../types/constants.js';
import type { INotifyMessage } from '../../types/track.js';
import type { IObserver } from './types.js';
import log, { LogLevelDesc } from 'loglevel';

log.setDefaultLevel(LOG_LEVEL as LogLevelDesc);

export class BaseNotifier implements IObserver {
	public async update(notification: INotifyMessage): Promise<void> {
		throw new Error('BaseNotifier: Method not implemented.');
	}
}

export class LoggerNotifier extends BaseNotifier implements IObserver {
	public async update(notification: INotifyMessage): Promise<void> {
		switch (notification.severity) {
			case 'info':
				log.info(notification.message);
				break;
			case 'error':
				log.error(notification.message);
				break;
			case 'warn':
				log.warn(notification.message);
				break;
			case 'trace':
				log.trace(notification.message);
				break;
			case 'debug':
				log.debug(notification.message);
				break;
			default:
				log.debug(notification.message);
				break;
		}
	}
}

export class DatadogNotifier extends BaseNotifier implements IObserver {
	public async update(notification: INotifyMessage): Promise<void> {
		// Make actions for sending info to Datadog
		throw new Error('Method not implemented.');
	}
}
