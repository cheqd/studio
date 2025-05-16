import NodeCache from 'node-cache';
import * as dotenv from 'dotenv';

import { PaymentAccountEntity } from '../entities/payment.account.entity.js';

dotenv.config();

let { LOCAL_STORE_TTL = 600 } = process.env;

export class LocalStore {
	private cache: NodeCache;

	public static instance = new LocalStore();

	constructor() {
		this.cache = new NodeCache();
	}

	setCustomerAccounts(key: string, data: PaymentAccountEntity[]) {
		this.cache.set(key, data, +LOCAL_STORE_TTL);
	}

	getCustomerAccounts(key: string) {
		return this.cache.get(key) as PaymentAccountEntity[] | undefined;
	}
}
