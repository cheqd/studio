import EventEmitter from 'node:events';
import type { INotifyMessage, ITrackOperation } from '../../types/track.js';
import { DatadogNotifier, LoggerNotifier } from './notifiers.js';
import {
	DBOperationSubscriber,
	ResourceSubscriber,
	CredentialSubscriber,
	DIDSubscriber,
	CredentialStatusSubscriber,
	PresentationSubscriber,
} from './subscribers.js';
import type { ITrackType } from './types.js';
import { ENABLE_DATADOG } from '../../types/constants.js';
import { Observer } from './observer.js';

export class EventTracker {
	readonly emitter: EventEmitter;
	readonly tracker: Observer;
	readonly notifier: Observer;

	constructor(emitter?: EventEmitter, tracker?: Observer, notifier?: Observer) {
		this.emitter = emitter || new EventEmitter();
		this.tracker = tracker || new Observer();
		this.notifier = notifier || new Observer();

		if (!tracker) {
			this.setupDefaultTrackers();
		}
		if (!notifier) {
			this.setupDefaultNotifiers();
		}
		this.setupBaseEvents();
	}

	setupDefaultTrackers() {
		this.tracker.attach(new DBOperationSubscriber(this.getEmitter()));
		this.tracker.attach(new ResourceSubscriber(this.getEmitter()));
		this.tracker.attach(new CredentialSubscriber(this.getEmitter()));
		this.tracker.attach(new DIDSubscriber(this.getEmitter()));
		this.tracker.attach(new CredentialStatusSubscriber(this.getEmitter()));
		this.tracker.attach(new PresentationSubscriber(this.getEmitter()));
	}

	setupDefaultNotifiers() {
		this.notifier.attach(new LoggerNotifier());
		if (ENABLE_DATADOG) {
			this.notifier.attach(new DatadogNotifier());
		}
	}

	getEmitter(): EventEmitter {
		return this.emitter;
	}

	setupBaseEvents() {
		this.emitter.on('track', this.track.bind(this));
		this.emitter.on('notify', this.notify.bind(this));
	}

	async track(trackOperation: ITrackOperation): Promise<void> {
		await this.tracker.notify(trackOperation);
	}

	async notify(notifyMessage: INotifyMessage): Promise<void> {
		await this.notifier.notify(notifyMessage);
	}

	emit(eventName: string | symbol, ...args: ITrackType[]): boolean {
		return this.getEmitter().emit(eventName, ...args);
	}
}

export const eventTracker = new EventTracker();
