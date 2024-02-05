import type { ITrackOperation, INotifyMessage } from '../../types/track';


export type ITrackType = ITrackOperation | INotifyMessage;

export interface IObserver {
	update(operation: ITrackType): Promise<void>;
}

export interface ITrackSubject {
	// Attach an observer to the subject.
	attach(observer: IObserver): void;

	// Detach an observer from the subject.
	detach(observer: IObserver): void;

	// Notify all observers about an event.
	notify(operation: ITrackType): void;
}