import { coin, type Coin } from '@cosmjs/amino';
import { MINIMAL_DENOM } from '../../types/constants.js';
import type {
	TrackData,
	IResourceTrack,
	ICredentialStatusTrack,
	ICredentialTrack,
	IDIDTrack,
} from '../../types/track.js';
import type Stripe from 'stripe';
import type { ISubmitData, ISubmitOperation } from './submitter.js';
import type { ISubmitOptions } from './types.js';

export function isResourceTrack(data: TrackData): data is IResourceTrack {
	return Object.keys(data).length === 2 && (data as IResourceTrack).resource !== undefined;
}

export function isCredentialStatusTrack(data: TrackData): data is ICredentialStatusTrack {
	return (
		Object.keys(data).length >= 3 &&
		(data as ICredentialStatusTrack).resource !== undefined &&
		(data as ICredentialStatusTrack).encrypted !== undefined
	);
}

export function isCredentialTrack(data: TrackData): data is ICredentialTrack {
	return isCredentialStatusTrack(data);
}

export function isDIDTrack(data: TrackData): data is IDIDTrack {
	return Object.keys(data).length === 1 && (data as IDIDTrack).did !== undefined;
}

export function toCoin(amount: bigint, denom = MINIMAL_DENOM): Coin {
	return coin(amount.toString(), denom);
}

export function builSubmitOperation(subscription: Stripe.Subscription, name: string, options?: ISubmitOptions) {
	return {
		operation: name,
		data: {
			subscriptionId: subscription.id,
			paymentProviderId: subscription.customer as string,
			status: subscription.status,
			currentPeriodStart: new Date(subscription.current_period_start * 1000),
			currentPeriodEnd: new Date(subscription.current_period_end * 1000),
			trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
			trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
		} satisfies ISubmitData,
		options,
	} satisfies ISubmitOperation;
}
