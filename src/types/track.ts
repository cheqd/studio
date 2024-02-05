import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
import type { CheqdNetwork } from '@cheqd/sdk';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { UserEntity } from '../database/entities/user.entity.js';
import type { LogLevelDesc } from 'loglevel';

export type TrackData = IResourceTrack | ICredentialStatusTrack | ICredentialTrack | IDIDTrack | IPresentationTrack | IKeyTrack;

export interface ITrackOperation {
	// function name, e.g. createDid, issueCredential, etc.
	name: string;
	// category of the operation, e.g. did, resource, credential, credential-status
	category: string;
	// data of the operation, e.g. did, resource, credentialStatus
	data: TrackData;
	// customer who initiated the operation (like organistation)
	customer?: CustomerEntity;
	// user who initiated the operation
	user?: UserEntity;
	// fee payment options
	feePaymentOptions?: {
		feePaymentAddress: string;
		feePaymentAmount: number;
		feePaymentNetwork: CheqdNetwork;
	};
}

export interface IResourceTrack {
	resource: LinkedResourceMetadataResolutionResult;
	did: string;
}

export interface ICredentialStatusTrack {
	did: string;
	resource?: LinkedResourceMetadataResolutionResult;
	encrypted?: boolean;
	symmetricKey?: string;
}

export type ICredentialTrack = ICredentialStatusTrack;

export interface IDIDTrack {
	did: string;
}

export interface IPresentationTrack {
	holder: string;
}

export interface IKeyTrack {
	keyRef: string;
	keyType: string;
}

export interface ITrackResult {
	operation: ITrackOperation;
	error?: string;
}

export interface INotifyMessage {
	message: string;
	severity?: LogLevelDesc;
}
