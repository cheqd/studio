import { CheqdNetwork } from '@cheqd/sdk';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { UnsuccessfulQueryResponseBody } from './shared.js';

// Positive

export type QueryCustomerResponseBody = {
	customer: {
		customerId: string;
		name: string;
	};
	paymentAccount: {
		[CheqdNetwork.Testnet]: string | null;
		[CheqdNetwork.Mainnet]: string | null;
	};
};

export type UpdateCustomerEntity = Partial<CustomerEntity> & Pick<CustomerEntity, 'customerId'>;

export type QueryIdTokenResponseBody = {
	idToken: string;
};

//Negative

export type UnsuccessfulQueryCustomerResponseBody = UnsuccessfulQueryResponseBody;

export type UnsuccessfulQueryIdTokenResponseBody = UnsuccessfulQueryResponseBody;
