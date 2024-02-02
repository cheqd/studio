import EventEmitter from "node:events"
import type { ITrackOperation, ITrackResult } from '../../types/track.js'
import { LoggerNotifier } from "./notifier.js"
import { DBOperationObserver, ResourceObserver, CredentialObserver, DIDObserver, CredentialStatusObserver, IObserver } from "./observer.js"
import type { ITrackType } from './observer.js'

class EventTracker {
    readonly emitter: EventEmitter
	readonly tracker: OperationTracker
	readonly notifier: TrackNotifier

    constructor (emitter?: EventEmitter, tracker?: OperationTracker, notifier?: TrackNotifier) {
		this.emitter = emitter || new EventEmitter()
		this.tracker = tracker || new OperationTracker()
		this.notifier = notifier || new TrackNotifier()
		if (!tracker) {
			this.setupDefaultTrackers()
		}
		if (!notifier) {
			this.setupDefaultNotifiers()
		}
		this.setupBaseEvent()
    }

	setupDefaultTrackers() {
        this.tracker.attach(new DBOperationObserver(this.notifier))
		this.tracker.attach(new ResourceObserver(this.notifier))
        this.tracker.attach(new CredentialObserver(this.notifier))
        this.tracker.attach(new DIDObserver(this.notifier))
        this.tracker.attach(new CredentialStatusObserver(this.notifier))
	}

	setupDefaultNotifiers() {
		this.notifier.attach(new LoggerNotifier())
	}

    getEmitter(): EventEmitter {
        return this.emitter
    }

    setupBaseEvent() {
        this.emitter.on('track', this.track.bind(this))
    }

    async track(trackOperation: ITrackOperation): Promise<void> {
		await this.tracker.notify(trackOperation);
	}
}


export class OperationTracker implements ITrackSubject {
	private observers: IObserver[] = [];

	public attach(observer: IObserver): void {
		const isExist = this.observers.includes(observer);
		if (isExist) {
			return console.warn('TrackOperation: Observer has been attached already.');
		}
		this.observers.push(observer);
	}

	public detach(observer: IObserver): void {
		const observerIndex = this.observers.indexOf(observer);
		if (observerIndex === -1) {
			return console.warn('TrackOperation: Nonexistent observer.');
		}

		this.observers.splice(observerIndex, 1);
	}

	public async notify(operation: ITrackOperation): Promise<void> {
		Promise.all(this.observers.map((observer) => observer.update(operation)));
	}
}

export class TrackNotifier implements ITrackSubject {
	private observers: IObserver[] = [];

	public attach(observer: IObserver): void {
		const isExist = this.observers.includes(observer);
		if (isExist) {
			return console.warn('TrackNotifier: Observer has been attached already.');
		}
		this.observers.push(observer);
	}

	public detach(observer: IObserver): void {
		const observerIndex = this.observers.indexOf(observer);
		if (observerIndex === -1) {
			return console.warn('TrackOperation: Nonexistent observer.');
		}

		this.observers.splice(observerIndex, 1);
	}

	public async notify(notification: ITrackResult): Promise<void> {
		Promise.all(this.observers.map((observer) => observer.update(notification)));
	}
}

export interface ITrackSubject {
	// Attach an observer to the subject.
	attach(observer: IObserver): void;

	// Detach an observer from the subject.
	detach(observer: IObserver): void;

	// Notify all observers about an event.
	notify(operation: ITrackType): void;
}

export const eventTracker = new EventTracker()

