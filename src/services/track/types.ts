import type { CustomerEntity } from '../../database/entities/customer.entity';
import type { ITrackOperation, INotifyMessage, TrackData } from '../../types/track';
import type { ISubmitOperation } from './submitter';

export type ITrackType = ITrackOperation<TrackData> | INotifyMessage | ISubmitOperation;

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

export interface ISubmitOptions {
	customer?: CustomerEntity;
}
