import EventEmitter from 'node:events';
import type { INotifyMessage, ITrackOperation } from '../../types/track.js';
import { LoggerNotifier } from './notifiers.js';
import { DBOperationSubscriber } from './operation-subscriber.js';
import { ResourceSubscriber } from './api/resource-subscriber.js';
import { PresentationSubscriber } from './api/presentation-subscriber.js';
import { CredentialStatusSubscriber } from './api/credential-status-subscriber.js';
import { DIDSubscriber } from './api/did-subscriber.js';
import { CredentialSubscriber } from './api/credential-subscriber.js';
import type { ITrackType } from './types.js';
import { SubmitSubject, TrackSubject } from './observer.js';
import type { ISubmitOperation } from './submitter.js';
import { PortalAccountCreateSubmitter } from './admin/account-submitter.js';

export class EventTracker {
	readonly emitter: EventEmitter;
	readonly tracker: TrackSubject;
	readonly notifier: TrackSubject;
	readonly submitter: SubmitSubject;

	constructor(emitter?: EventEmitter, tracker?: TrackSubject, notifier?: TrackSubject, submitter?: SubmitSubject) {
		this.emitter = emitter || new EventEmitter();
		this.tracker = tracker || new TrackSubject();
		this.notifier = notifier || new TrackSubject();
		this.submitter = submitter || new SubmitSubject();

		if (!tracker) {
			this.setupDefaultTrackers();
		}
		if (!notifier) {
			this.setupDefaultNotifiers();
		}
		if (!submitter) {
			this.setupDefaultSubmitters();
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
	}

	setupDefaultSubmitters() {
		this.submitter.attach(new PortalAccountCreateSubmitter(this.getEmitter()));
	}

	getEmitter(): EventEmitter {
		return this.emitter;
	}

	setupBaseEvents() {
		this.emitter.on('track', this.track.bind(this));
		this.emitter.on('notify', this.notify.bind(this));
		this.emitter.on('submit', this.submit.bind(this));
	}

	async track(trackOperation: ITrackOperation): Promise<void> {
		await this.tracker.notify(trackOperation);
	}

	async notify(notifyMessage: INotifyMessage): Promise<void> {
		await this.notifier.notify(notifyMessage);
	}

	async submit(operation: ISubmitOperation): Promise<void> {
		await this.submitter.notify(operation);
	}

	static compileBasicNotification(message: string, operation?: string): string {
		const parts = [];
		const date = new Date().toISOString();
		parts.push(date);
		if (operation) parts.push('Operation: ' + operation);
		parts.push('Message: ' + message);
		return parts.join(' | ');
	}

	emit(eventName: string | symbol, ...args: ITrackType[]): boolean {
		return this.getEmitter().emit(eventName, ...args);
	}
}

export const eventTracker = new EventTracker();
