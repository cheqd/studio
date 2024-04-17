import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
import type { CheqdNetwork } from '@cheqd/sdk';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { UserEntity } from '../database/entities/user.entity.js';
import type { LogLevelDesc } from 'loglevel';
import type { ResourceEntity } from '../database/entities/resource.entity.js';
import { ResourceService } from '../services/api/resource.js';
import type { Coin } from '@cosmjs/amino';

export type TrackData =
	| IResourceTrack
	| ICredentialStatusTrack
	| ICredentialTrack
	| IDIDTrack
	| IPresentationTrack
	| IKeyTrack;

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
	// was operation successful?
	successful?: boolean;
	// fee payment options
	feePaymentOptions?: IFeePaymentOptions[];
}

export interface IFeePaymentOptions {
	txHash: string;
	timestamp: Date;
	fromAddress: string;
	toAddress: string;
	amount: Coin;
	network: CheqdNetwork;
	fee: Coin;
	successful: boolean;
	resourceId?: string;
}

export interface IBaseTrack {
	error?: string;
}

export interface IResourceTrack extends IBaseTrack {
	resource: LinkedResourceMetadataResolutionResult;
	did: string;
}

export interface ICredentialStatusTrack extends IBaseTrack {
	did: string;
	resource?: LinkedResourceMetadataResolutionResult;
	encrypted?: boolean;
	symmetricKey?: string;
}

export type ICredentialTrack = ICredentialStatusTrack;

export interface IDIDTrack extends IBaseTrack {
	did: string;
}

export interface IPresentationTrack extends IBaseTrack {
	holder: string;
}

export interface IKeyTrack extends IBaseTrack {
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

export class TrackOperationWithPayment implements ITrackOperation {
	name: string;
	category: string;
	data: TrackData;
	customer: CustomerEntity;
	user?: UserEntity;
	feePaymentOptions: IFeePaymentOptions[];

	constructor(trackOperation: ITrackOperation) {
		this.name = trackOperation.name;
		this.category = trackOperation.category;
		this.data = trackOperation.data;
		this.customer = trackOperation.customer as CustomerEntity;
		this.user = trackOperation.user;
		this.feePaymentOptions = trackOperation.feePaymentOptions as IFeePaymentOptions[];
	}

	public validate(): ITrackResult {
		// validate operation
		if (!this.customer) {
			return { operation: this, error: 'Customer is required for tracking the payment' };
		}

		if (!this.feePaymentOptions) {
			return { operation: this, error: 'Fee payment options are required for tracking the payment' };
		}
		return { operation: this, error: '' };
	}

	async getResourceEntity(): Promise<ResourceEntity | null> {
		if (this.data && (this.data as IResourceTrack).resource) {
			return await ResourceService.instance.get((this.data as IResourceTrack).resource.resourceId);
		}
		if (this.feePaymentOptions && this.feePaymentOptions[0].resourceId) {
			return await ResourceService.instance.get(this.feePaymentOptions[0].resourceId);
		}
		return null;
	}
}
