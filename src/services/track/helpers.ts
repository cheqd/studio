import { coin, type Coin } from '@cosmjs/amino';
import { MINIMAL_DENOM } from '../../types/constants.js';
import type {
	TrackData,
	IResourceTrack,
	ICredentialStatusTrack,
	ICredentialTrack,
	IDIDTrack,
} from '../../types/track.js';

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
