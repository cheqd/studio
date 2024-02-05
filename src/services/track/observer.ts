import type { ITrackSubject, IObserver, ITrackType } from './types.js';


export class Observer implements ITrackSubject {
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

	public async notify(operation: ITrackType): Promise<void> {
		Promise.all(this.observers.map((observer) => observer.update(operation)));
	}
}
