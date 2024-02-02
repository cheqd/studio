import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
import type { CheqdNetwork } from '@cheqd/sdk';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { UserEntity } from '../database/entities/user.entity.js';

export type TrackData = IResourceTrack | ICredentialStatusTrack | ICredentialTrack | IDIDTrack;

export interface ITrackOperation {
	// function name, e.g. createDid, issueCredential, etc.
	name: string;
	// category of the operation, e.g. did, resource, credential, credential-status
	category: string;
	// data of the operation, e.g. did, resource, credentialStatus
	data: TrackData;
	// customer who initiated the operation (like organistation)
	customer: CustomerEntity;
	// user who initiated the operation
	user?: UserEntity;
	// identifier
	did?: string;
	// controller's key
	key?: string;
	// fee payment options
	feePaymentOptions?: {
		feePaymentAddress: string;
		feePaymentAmount: number;
		feePaymentNetwork: CheqdNetwork;
	};
}

export function isResourceTrack(data: TrackData): data is IResourceTrack {
	return Object.keys(data).length === 1 && (data as IResourceTrack).resource !== undefined;
}

export function isCredentialStatusTrack(data: TrackData): data is ICredentialStatusTrack {
	return (
		Object.keys(data).length >= 2 &&
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

export interface IResourceTrack {
	resource: LinkedResourceMetadataResolutionResult;
}

export interface ICredentialStatusTrack {
	resource?: LinkedResourceMetadataResolutionResult;
	encrypted?: boolean;
	symmetricKey?: string;
}

export type ICredentialTrack = ICredentialStatusTrack;

export interface IDIDTrack {
	did: string;
}

export interface ITrackResult {
	tracked: boolean;
	operation: ITrackOperation;
	message?: string;
	error?: string;
}
